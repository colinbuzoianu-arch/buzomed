import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { encryptCnp, isCnpEncryptionConfigured } from '@/lib/crypto/cnp-cipher'
import { hashCnp } from '@/lib/crypto/cnp-hash'
import { validateCnp } from '@/lib/crypto/cnp-validation'
import { getOrCreateTenantCnpSalt } from '@/lib/crypto/tenant-salt'
import {
  isFutureDate,
  normalizeCnpInput,
  normalizeWorkplaceValue,
  parseFlexibleDate,
  workplaceKey,
} from '@/lib/employees/import-normalize'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { logSystemError } from '@/lib/system-log/error-log'
import { asObject } from '@/lib/validation'

/**
 * Bulk employee import — commit endpoint.
 *
 * Company resolution still has two modes (per-row company columns, or a
 * single selected fallback company), but WORKPLACE resolution now follows
 * ONE rule in both (import spec §5):
 *
 *   - A workplace value (`workplaceName`, or a `department` when no
 *     workplace column is present) is looked up under the resolved company
 *     by normalized name/department and CREATED if missing. A department
 *     supplied alongside a new workplace is stored as `Workplace.department`.
 *   - A row is NEVER rejected for lacking a matching workplace. With no
 *     company at all it simply imports without an assignment.
 *
 * Other spec points honored here:
 *   §1 CNP — validated with validateCnp (invalid = warning, employee still
 *       imported without CNP), then encrypted + tenant-salted-hashed via the
 *       same helpers as app/api/employees/route.ts. birthDate/gender are
 *       derived from the CNP. Duplicate detection matches cnpHash FIRST. The
 *       CNP never appears in any log.
 *   §2 hireDate — becomes the assignment `startDate` (today when absent,
 *       invalid, or in the future).
 *   §3 fitnessValidUntil — creates a pending `Recall` (control_periodic)
 *       when the employee has a resolved workplace; see §3 block below.
 *   §4 notes — stored on `Employee.notes`.
 */

interface ImportRow {
  rowNumber: number
  firstName: string
  lastName: string
  cnp: string | null
  companyEmployeeId: string | null
  email: string | null
  department: string | null
  jobTitle: string | null
  city: string | null
  notes: string | null
  hireDate: string | null
  fitnessValidUntil: string | null
  skipIfDuplicate: boolean
  // Extended columns
  companyName: string | null
  cui: string | null
  companyAddress: string | null
  workplaceName: string | null
}

interface RowOutcome {
  rowNumber: number
  outcome: 'created' | 'skipped' | 'failed'
  reason?: string
  employeeId?: string
  duplicateEmployeeId?: string
  warning?: string
}

const MAX_ROWS_PER_IMPORT = 500
const NOTES_MAX = 4000

function normalizeCui(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/^RO\s*/i, '')
}

function isValidCui(raw: string): boolean {
  return /^\d{6,10}$/.test(normalizeCui(raw))
}

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const body = asObject(raw) ?? {}
  const fallbackCompanyId =
    typeof body.companyId === 'string' && body.companyId ? body.companyId : null
  const stagedFileId =
    typeof body.stagedFileId === 'string' && body.stagedFileId ? body.stagedFileId : null
  const rowsInput = Array.isArray(body.rows) ? body.rows : []

  if (rowsInput.length === 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues: ['rows is empty'] },
      { status: 400 }
    )
  }
  if (rowsInput.length > MAX_ROWS_PER_IMPORT) {
    return NextResponse.json(
      { error: 'too_many_rows', message: `Maximum ${MAX_ROWS_PER_IMPORT} rows per import` },
      { status: 400 }
    )
  }

  const tenantId = auth.user.tenantId
  const userId = auth.user.id

  // Validate the fallback company if provided
  let fallbackCompany: { id: string; name: string } | null = null
  if (fallbackCompanyId) {
    const found = await prisma.company.findFirst({
      where: { id: fallbackCompanyId, tenantId, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!found) {
      return NextResponse.json({ error: 'company_not_found' }, { status: 404 })
    }
    fallbackCompany = found
  }

  // Normalize and validate input rows
  const rows: ImportRow[] = []
  for (let i = 0; i < rowsInput.length; i++) {
    const r = asObject(rowsInput[i]) ?? {}
    const firstName = typeof r.firstName === 'string' ? r.firstName.trim() : ''
    const lastName = typeof r.lastName === 'string' ? r.lastName.trim() : ''
    if (!firstName || !lastName) continue
    const cnpRaw = typeof r.cnp === 'string' && r.cnp.trim() ? normalizeCnpInput(r.cnp) : null
    rows.push({
      rowNumber: typeof r.rowNumber === 'number' ? r.rowNumber : i + 2,
      firstName,
      lastName,
      cnp: cnpRaw || null,
      companyEmployeeId:
        typeof r.companyEmployeeId === 'string' && r.companyEmployeeId.trim()
          ? r.companyEmployeeId.trim()
          : null,
      email: typeof r.email === 'string' && r.email.trim() ? r.email.trim().toLowerCase() : null,
      department:
        typeof r.department === 'string' && r.department.trim() ? r.department.trim() : null,
      jobTitle: typeof r.jobTitle === 'string' && r.jobTitle.trim() ? r.jobTitle.trim() : null,
      city: typeof r.city === 'string' && r.city.trim() ? r.city.trim() : null,
      notes:
        typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, NOTES_MAX) : null,
      hireDate: typeof r.hireDate === 'string' && r.hireDate.trim() ? r.hireDate.trim() : null,
      fitnessValidUntil:
        typeof r.fitnessValidUntil === 'string' && r.fitnessValidUntil.trim()
          ? r.fitnessValidUntil.trim()
          : null,
      skipIfDuplicate: r.skipIfDuplicate !== false,
      companyName:
        typeof r.companyName === 'string' && r.companyName.trim() ? r.companyName.trim() : null,
      cui: typeof r.cui === 'string' && r.cui.trim() ? r.cui.trim() : null,
      companyAddress:
        typeof r.companyAddress === 'string' && r.companyAddress.trim()
          ? r.companyAddress.trim()
          : null,
      workplaceName:
        typeof r.workplaceName === 'string' && r.workplaceName.trim()
          ? r.workplaceName.trim()
          : null,
    })
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues: ['No valid rows to import'] },
      { status: 400 }
    )
  }

  // Detect mode: extended if any row carries per-row company data
  const isExtendedMode = rows.some((r) => r.cui || r.companyName)

  // Guard: with neither per-row company data nor a selected company there
  // is nothing to attach companies/workplaces to. Employees could still be
  // created tenant-scoped, but the UI always selects a company in simple
  // mode, so treat this as a client bug rather than silently importing.
  if (!isExtendedMode && !fallbackCompanyId) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        issues: ['companyId is required when file has no company columns'],
      },
      { status: 400 }
    )
  }

  // ── CNP crypto setup (spec §1) ──────────────────────────────────────
  // Resolve the tenant salt lazily and only once; skip the whole CNP path
  // when encryption isn't configured and report that a single time.
  const anyCnp = rows.some((r) => r.cnp)
  const encryptionConfigured = isCnpEncryptionConfigured()
  let tenantSalt: string | null = null
  let saltError = false
  async function getSalt(): Promise<string | null> {
    if (!encryptionConfigured || saltError) return null
    if (tenantSalt) return tenantSalt
    try {
      tenantSalt = await getOrCreateTenantCnpSalt(tenantId)
      return tenantSalt
    } catch (err) {
      saltError = true
      void logSystemError({
        tenantId,
        route: '/api/employees/import/commit',
        method: 'POST',
        error: err,
        context: { phase: 'tenant_salt' }, // never includes a CNP
      })
      return null
    }
  }

  // ── Recall examination type (spec §3) ───────────────────────────────
  // Look up the "control periodic" type by CODE, never a hardcoded id.
  const anyFitness = rows.some((r) => r.fitnessValidUntil)
  let controlPeriodicTypeId: string | null = null
  if (anyFitness) {
    const t = await prisma.examinationType.findUnique({
      where: { code: 'control_periodic' },
      select: { id: true },
    })
    controlPeriodicTypeId = t?.id ?? null
  }

  // Pre-load existing employees for duplicate detection (cnpHash FIRST).
  const existingEmployees = await prisma.employee.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, email: true, cnpHash: true },
  })
  const existingByName = new Map<string, string>()
  const existingByEmail = new Map<string, string>()
  const existingByCnpHash = new Map<string, string>()
  for (const e of existingEmployees) {
    existingByName.set(`${e.firstName.toLowerCase()}|${e.lastName.toLowerCase()}`, e.id)
    if (e.email) existingByEmail.set(e.email.toLowerCase(), e.id)
    if (e.cnpHash) existingByCnpHash.set(e.cnpHash, e.id)
  }

  // Running tallies (declared before the helpers that mutate them).
  let created = 0,
    skipped = 0,
    failed = 0
  let companiesCreated = 0,
    workplacesCreated = 0
  let rowsWithoutCompany = 0,
    rowsWithoutWorkplace = 0
  let cnpSaved = 0,
    cnpInvalid = 0,
    cnpSkippedNoEncryption = 0
  let recallsCreated = 0
  let anyRowHadWorkplaceName = false
  const newCompanyList: Array<{ id: string; name: string; cui: string }> = []
  const newWorkplaceNames: string[] = []
  const results: RowOutcome[] = []

  // Per-import caches
  const companiesCache = new Map<string, string>() // normalizedCui → companyId
  const companiesByName = new Map<string, string | null>() // lowerName → companyId (null = not found)
  const workplaceIndexByCompany = new Map<string, Map<string, { id: string; name: string }>>()

  async function getWorkplaceIndex(companyId: string) {
    const cached = workplaceIndexByCompany.get(companyId)
    if (cached) return cached
    const wps = await prisma.workplace.findMany({
      where: { companyId, tenantId, deletedAt: null },
      select: { id: true, name: true, department: true },
    })
    const idx = new Map<string, { id: string; name: string }>()
    for (const w of wps) {
      idx.set(workplaceKey(w.name), { id: w.id, name: w.name })
      if (w.department) idx.set(workplaceKey(w.department), { id: w.id, name: w.name })
    }
    workplaceIndexByCompany.set(companyId, idx)
    return idx
  }

  // Find-or-create a workplace under a company (import spec §5.1 / §5.2).
  async function resolveWorkplace(
    companyId: string,
    label: string,
    departmentForNew: string | null
  ): Promise<{ id: string; created: boolean }> {
    const idx = await getWorkplaceIndex(companyId)
    const key = workplaceKey(label)
    const found = idx.get(key)
    if (found) return { id: found.id, created: false }

    const name = normalizeWorkplaceValue(label)
    // Carry the department onto the new workplace. For a department-only row
    // (label === department) this yields name === department === value, as
    // §5.2 asks; for a workplace row with a distinct department it stores that
    // department as descriptive text (§5.1).
    const dept = departmentForNew ? normalizeWorkplaceValue(departmentForNew) : null
    let newWp: { id: string }
    try {
      newWp = await prisma.workplace.create({
        data: {
          companyId,
          tenantId,
          name,
          department: dept,
          isActive: true,
        },
        select: { id: true },
      })
      workplacesCreated++
      newWorkplaceNames.push(name)
    } catch (createErr) {
      if ((createErr as { code?: string }).code !== 'P2002') throw createErr
      const winner = await prisma.workplace.findFirst({
        where: {
          companyId,
          tenantId,
          deletedAt: null,
          name: { equals: name, mode: 'insensitive' },
        },
        select: { id: true },
      })
      if (!winner) throw createErr
      newWp = winner
    }
    idx.set(key, { id: newWp.id, name })
    return { id: newWp.id, created: true }
  }

  for (const row of rows) {
    if (row.workplaceName) anyRowHadWorkplaceName = true
    try {
      // ── 1. Resolve company ──────────────────────────────────────────
      let resolvedCompanyId: string | null = null
      let rowWarning: string | undefined

      if (row.cui && row.companyName) {
        if (!isValidCui(row.cui)) {
          rowWarning = 'invalid_cui'
          resolvedCompanyId = fallbackCompanyId
        } else {
          const normalized = normalizeCui(row.cui)
          const cachedCompanyId = companiesCache.get(normalized)
          if (cachedCompanyId !== undefined) {
            resolvedCompanyId = cachedCompanyId
          } else {
            const existing = await prisma.company.findFirst({
              where: { tenantId, deletedAt: null, cui: { in: [normalized, `RO${normalized}`] } },
              select: { id: true },
            })
            if (existing) {
              companiesCache.set(normalized, existing.id)
              resolvedCompanyId = existing.id
            } else {
              let newCo: { id: string }
              try {
                newCo = await prisma.company.create({
                  data: {
                    tenantId,
                    name: row.companyName,
                    cui: normalized,
                    addressLine1: row.companyAddress ?? null,
                    createdFromImport: true,
                  },
                  select: { id: true },
                })
                newCompanyList.push({ id: newCo.id, name: row.companyName, cui: normalized })
                companiesCreated++
              } catch (createErr) {
                if ((createErr as { code?: string }).code !== 'P2002') throw createErr
                const winner = await prisma.company.findFirst({
                  where: {
                    tenantId,
                    deletedAt: null,
                    cui: { in: [normalized, `RO${normalized}`] },
                  },
                  select: { id: true },
                })
                if (!winner) throw createErr
                newCo = winner
              }
              companiesCache.set(normalized, newCo.id)
              resolvedCompanyId = newCo.id
            }
          }
        }
      } else if (row.companyName) {
        const coNameKey = row.companyName.toLowerCase()
        if (companiesByName.has(coNameKey)) {
          resolvedCompanyId = companiesByName.get(coNameKey) ?? fallbackCompanyId
        } else {
          const byName = await prisma.company.findFirst({
            where: {
              tenantId,
              deletedAt: null,
              name: { equals: row.companyName, mode: 'insensitive' },
            },
            select: { id: true },
          })
          companiesByName.set(coNameKey, byName?.id ?? null)
          resolvedCompanyId = byName?.id ?? fallbackCompanyId
        }
        if (!resolvedCompanyId) rowWarning = 'incomplete_company_columns'
      } else if (row.cui) {
        rowWarning = 'incomplete_company_columns'
        resolvedCompanyId = fallbackCompanyId
      } else {
        resolvedCompanyId = fallbackCompanyId
      }

      if (!resolvedCompanyId) rowsWithoutCompany++

      // ── 2. Resolve workplace (unified find-or-create) ───────────────
      let resolvedWorkplaceId: string | null = null
      // A workplace column wins; otherwise a department value stands in for
      // the workplace. The department text is carried onto a freshly created
      // workplace (spec §5.1).
      const wpLabel = row.workplaceName ?? row.department
      const departmentForNew = row.department

      if (wpLabel && resolvedCompanyId) {
        const wp = await resolveWorkplace(resolvedCompanyId, wpLabel, departmentForNew)
        resolvedWorkplaceId = wp.id
      }
      if (!resolvedWorkplaceId) rowsWithoutWorkplace++

      // ── 3. CNP (spec §1) ────────────────────────────────────────────
      let cnpEncrypted: string | null = null
      let cnpHash: string | null = null
      let derivedBirthDate: Date | null = null
      let derivedGender: string | null = null
      if (row.cnp) {
        const v = validateCnp(row.cnp)
        if (!v.valid) {
          cnpInvalid++
          rowWarning = rowWarning ?? 'cnp_invalid'
        } else if (!encryptionConfigured) {
          cnpSkippedNoEncryption++
        } else {
          const salt = await getSalt()
          if (salt) {
            cnpHash = hashCnp(row.cnp, salt)
            cnpEncrypted = encryptCnp(row.cnp)
            derivedBirthDate = v.birthDate ?? null
            derivedGender = v.gender ?? null
          } else {
            // Salt resolution failed — treat like "no encryption" for this run.
            cnpSkippedNoEncryption++
          }
        }
      }

      // ── 4. Duplicate detection (cnpHash FIRST, then name, then email) ─
      const nameKey = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}`
      const dupByCnp = cnpHash ? existingByCnpHash.get(cnpHash) : undefined
      const dupByName = existingByName.get(nameKey)
      const dupByEmail = row.email ? existingByEmail.get(row.email) : undefined
      const duplicate = dupByCnp ?? dupByName ?? dupByEmail

      // Hire date → assignment start date (spec §2). Invalid/future ⇒ today.
      let startDate = new Date()
      if (row.hireDate) {
        const p = parseFlexibleDate(row.hireDate)
        if (p.status === 'valid' && !isFutureDate(p.date)) startDate = p.date
      }

      if (duplicate && row.skipIfDuplicate) {
        let skipWarning: string | undefined = rowWarning
        if (resolvedWorkplaceId) {
          const hasAssignment = await prisma.employeeWorkplaceAssignment.findFirst({
            where: { employeeId: duplicate, isCurrent: true },
            select: { id: true },
          })
          if (!hasAssignment) {
            await prisma.employeeWorkplaceAssignment.create({
              data: {
                tenantId,
                employeeId: duplicate,
                workplaceId: resolvedWorkplaceId,
                startDate,
                isCurrent: true,
                reasonForChange: 'hired',
              },
            })
            skipWarning = 'workplace_assigned_on_skip'
          }
        }
        results.push({
          rowNumber: row.rowNumber,
          outcome: 'skipped',
          reason: 'duplicate_employee',
          duplicateEmployeeId: duplicate,
          warning: skipWarning,
        })
        skipped++
        continue
      }

      // ── 5. Create employee (+ assignment + imported recall) ──────────
      const fitness = row.fitnessValidUntil ? parseFlexibleDate(row.fitnessValidUntil) : null
      const result = await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({
          data: {
            tenantId,
            createdByUserId: userId,
            firstName: row.firstName,
            lastName: row.lastName,
            idDocumentType: cnpEncrypted ? 'cnp' : 'other',
            idDocumentNumber: null,
            cnpEncrypted,
            cnpHash,
            birthDate: derivedBirthDate,
            gender: derivedGender,
            companyId: resolvedCompanyId,
            companyEmployeeId: row.companyEmployeeId,
            jobTitle: row.jobTitle,
            city: row.city,
            email: row.email,
            notes: row.notes,
            nationality: 'RO',
            isActive: true,
          },
          select: { id: true },
        })

        if (resolvedWorkplaceId) {
          await tx.employeeWorkplaceAssignment.create({
            data: {
              tenantId,
              employeeId: employee.id,
              workplaceId: resolvedWorkplaceId,
              startDate,
              isCurrent: true,
              reasonForChange: 'hired',
            },
          })
        }

        // Imported fitness certificate → pending recall (spec §3).
        // Only when we have a workplace (Recall.workplaceId is required) and
        // the control-periodic type exists. Guard against a double recall on
        // re-import by refreshing an existing imported one for this
        // employee+workplace instead of inserting a second.
        if (fitness && fitness.status === 'valid' && resolvedWorkplaceId && controlPeriodicTypeId) {
          const dueDate = fitness.date
          const until = dueDate.toISOString().slice(0, 10)
          const note = `Fișă de aptitudine externă, importată — valabilă până la ${until}`
          const existingRecall = await tx.recall.findFirst({
            where: {
              tenantId,
              employeeId: employee.id,
              workplaceId: resolvedWorkplaceId,
              createdFromExaminationId: null,
              status: { in: ['pending', 'overdue'] },
              deletedAt: null,
            },
            select: { id: true },
          })
          if (existingRecall) {
            await tx.recall.update({
              where: { id: existingRecall.id },
              data: { dueDate, notes: note },
            })
          } else {
            await tx.recall.create({
              data: {
                tenant: { connect: { id: tenantId } },
                employee: { connect: { id: employee.id } },
                workplace: { connect: { id: resolvedWorkplaceId } },
                examinationType: { connect: { id: controlPeriodicTypeId } },
                dueDate,
                status: 'pending',
                notes: note,
              },
            })
          }
          return { id: employee.id, recallMade: true }
        }
        return { id: employee.id, recallMade: false }
      })

      if (result.recallMade) recallsCreated++
      else if (fitness && fitness.status === 'valid' && !resolvedWorkplaceId) {
        rowWarning = rowWarning ?? 'recall_not_created_no_workplace'
      }
      if (cnpEncrypted) cnpSaved++

      existingByName.set(nameKey, result.id)
      if (row.email) existingByEmail.set(row.email, result.id)
      if (cnpHash) existingByCnpHash.set(cnpHash, result.id)

      results.push({
        rowNumber: row.rowNumber,
        outcome: 'created',
        employeeId: result.id,
        warning: rowWarning,
      })
      created++
    } catch (err) {
      // IMPORTANT: never put the row's CNP (or any PII) into the log context.
      console.error('[employees.import] row failed', {
        rowNumber: row.rowNumber,
        error: (err as Error).message,
      })
      void logSystemError({
        tenantId,
        route: '/api/employees/import/commit',
        method: 'POST',
        error: err,
        context: { rowNumber: row.rowNumber, rowCount: rows.length },
      })
      const code = (err as { code?: string }).code
      results.push({
        rowNumber: row.rowNumber,
        outcome: 'failed',
        reason: code === 'P2002' ? 'unique_constraint' : 'unknown_error',
      })
      failed++
    }
  }

  // Compute anomaly flags before persisting the job audit record
  const flags: string[] = []
  if (rowsWithoutWorkplace > 0 && anyRowHadWorkplaceName)
    flags.push('workplace_data_present_but_unassigned')
  if (created === 0 && rows.length > 0) flags.push('zero_rows_created')
  if (failed > rows.length * 0.5) flags.push('high_failure_rate')
  if (companiesCreated > 0 && fallbackCompanyId) flags.push('unexpected_company_creation')
  if (anyCnp && !encryptionConfigured) flags.push('cnp_encryption_not_configured')
  if (anyFitness && !controlPeriodicTypeId) flags.push('recall_type_missing')

  void prisma.importJob
    .create({
      data: {
        tenantId,
        initiatedByUserId: auth.user.id,
        fallbackCompanyId,
        totalRows: rows.length,
        created,
        skipped,
        failed,
        companiesCreated,
        workplacesCreated,
        rowsWithoutCompany,
        rowsWithoutWorkplace,
        flags: flags.length > 0 ? flags : undefined,
      },
    })
    .catch((err) => console.error('[import] Failed to write ImportJob:', err))

  if (stagedFileId) {
    void prisma.importStagedFile
      .updateMany({
        where: { id: stagedFileId, tenantId, status: 'pending' },
        data: { status: 'processed', processedAt: new Date() },
      })
      .catch((err) => console.error('[import] Failed to mark staged file processed:', err))
  }

  // One-time notices surfaced in the result summary (not per row).
  const notices: string[] = []
  if (anyCnp && !encryptionConfigured) notices.push('cnp_encryption_not_configured')
  if (cnpSkippedNoEncryption > 0 && encryptionConfigured) notices.push('cnp_salt_unavailable')
  if (anyFitness && !controlPeriodicTypeId) notices.push('recall_type_missing')

  return NextResponse.json({
    summary: {
      total: rows.length,
      created,
      skipped,
      failed,
      companiesCreated,
      workplacesCreated,
      rowsWithoutCompany,
      rowsWithoutWorkplace,
      cnpSaved,
      cnpInvalid,
      recallsCreated,
    },
    notices,
    results,
    company: fallbackCompany ? { id: fallbackCompany.id, name: fallbackCompany.name } : null,
    companiesCreated: newCompanyList,
    workplacesCreated: newWorkplaceNames,
  })
}
