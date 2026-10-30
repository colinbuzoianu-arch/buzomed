import type { Prisma } from '@prisma/client'
import { type NextRequest, NextResponse } from 'next/server'
import { getRequestMeta, writeAuditLog } from '@/lib/audit/log'
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
import {
  computeEmployeeFieldUpdates,
  type UpdatableEmployeeField,
} from '@/lib/employees/import-update'
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
  phone: string | null
  notes: string | null
  hireDate: string | null
  fitnessValidUntil: string | null
  employerRequirements: string | null
  skipIfDuplicate: boolean
  // When true, a row matched to an existing employee UPDATES that employee
  // in place (prompt-import-update.md) instead of being skipped. Takes
  // precedence over skipIfDuplicate.
  updateExisting: boolean
  // Extended columns
  companyName: string | null
  cui: string | null
  companyAddress: string | null
  workplaceName: string | null
  // Punct de lucru (territorial site). Resolved to a WorkSite under the
  // company; the workplace is then found/created within that site.
  workSiteName: string | null
}

interface RowOutcome {
  rowNumber: number
  outcome: 'created' | 'updated' | 'skipped' | 'failed'
  reason?: string
  employeeId?: string
  duplicateEmployeeId?: string
  warning?: string
  // For an 'updated' row: which fields the import changed (field names only,
  // never values — the audit log holds old → new, PII-free).
  changed?: string[]
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
  // Import-history tracking (spec §8). The client creates ONE ImportJob
  // across all batches: the first batch leaves importJobId null (we create
  // it) and reads the id back; later batches pass it. fileName/importTotal
  // describe the whole import and are only used when the job is first made;
  // isFinalBatch flips the job to 'completed'.
  const providedImportJobId =
    typeof body.importJobId === 'string' && body.importJobId ? body.importJobId : null
  const fileName =
    typeof body.fileName === 'string' && body.fileName.trim()
      ? body.fileName.trim().slice(0, 300)
      : null
  const importTotal =
    typeof body.importTotal === 'number' && body.importTotal > 0 ? body.importTotal : null
  const isFinalBatch = body.isFinalBatch !== false // default true (single-batch import)

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
      phone: typeof r.phone === 'string' && r.phone.trim() ? r.phone.trim() : null,
      notes:
        typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, NOTES_MAX) : null,
      hireDate: typeof r.hireDate === 'string' && r.hireDate.trim() ? r.hireDate.trim() : null,
      fitnessValidUntil:
        typeof r.fitnessValidUntil === 'string' && r.fitnessValidUntil.trim()
          ? r.fitnessValidUntil.trim()
          : null,
      employerRequirements:
        typeof r.employerRequirements === 'string' && r.employerRequirements.trim()
          ? r.employerRequirements.trim().slice(0, 2000)
          : null,
      skipIfDuplicate: r.skipIfDuplicate !== false,
      updateExisting: r.updateExisting === true,
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
      workSiteName:
        typeof r.workSiteName === 'string' && r.workSiteName.trim()
          ? r.workSiteName.trim()
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

  // ── Import-history job (spec §8) ────────────────────────────────────
  // Resolve the ImportJob BEFORE touching any row, so an interrupted import
  // still leaves a 'running' trace. The first batch creates it; later
  // batches reuse the id they pass (validated against this tenant).
  let importJobId: string
  if (providedImportJobId) {
    const existing = await prisma.importJob.findFirst({
      where: { id: providedImportJobId, tenantId },
      select: { id: true },
    })
    if (existing) {
      importJobId = existing.id
    } else {
      const job = await prisma.importJob.create({
        data: {
          tenantId,
          initiatedByUserId: userId,
          fallbackCompanyId,
          fileName,
          totalRows: importTotal ?? rows.length,
          created: 0,
          skipped: 0,
          failed: 0,
          companiesCreated: 0,
          workplacesCreated: 0,
          rowsWithoutCompany: 0,
          rowsWithoutWorkplace: 0,
          status: 'running',
        },
        select: { id: true },
      })
      importJobId = job.id
    }
  } else {
    const job = await prisma.importJob.create({
      data: {
        tenantId,
        initiatedByUserId: userId,
        fallbackCompanyId,
        fileName,
        totalRows: importTotal ?? rows.length,
        created: 0,
        skipped: 0,
        failed: 0,
        companiesCreated: 0,
        workplacesCreated: 0,
        rowsWithoutCompany: 0,
        rowsWithoutWorkplace: 0,
        status: 'running',
      },
      select: { id: true },
    })
    importJobId = job.id
  }

  // Audit log context (shared by every per-row update entry).
  const requestMeta = getRequestMeta(request)

  // Running tallies (declared before the helpers that mutate them).
  let created = 0,
    updated = 0,
    skipped = 0,
    failed = 0
  let companiesCreated = 0,
    workplacesCreated = 0,
    workSitesCreated = 0
  let rowsWithoutCompany = 0,
    rowsWithoutWorkplace = 0
  let cnpSaved = 0,
    cnpInvalid = 0,
    cnpSkippedNoEncryption = 0
  let recallsCreated = 0
  let anyRowHadWorkplaceName = false
  const newCompanyList: Array<{ id: string; name: string; cui: string }> = []
  const newWorkplaceNames: string[] = []
  const newWorkSiteNames: string[] = []
  const results: RowOutcome[] = []

  // Per-import caches
  const companiesCache = new Map<string, string>() // normalizedCui → companyId
  const companiesByName = new Map<string, string | null>() // lowerName → companyId (null = not found)
  const workplaceIndexByCompany = new Map<string, Map<string, { id: string; name: string }>>()
  const workSiteIndexByCompany = new Map<string, Map<string, { id: string; name: string }>>()

  // Workplace identity is now (workSiteId, normalized name): the SAME activity
  // name ("Comercial") is a distinct workplace at each site. The lookup key
  // namespaces the name under its site (empty string = site-less, which is
  // exactly how every pre-existing workplace is matched).
  function wpIndexKey(workSiteId: string | null, label: string): string {
    return `${workSiteId ?? ''}|${workplaceKey(label)}`
  }

  async function getWorkplaceIndex(companyId: string) {
    const cached = workplaceIndexByCompany.get(companyId)
    if (cached) return cached
    const wps = await prisma.workplace.findMany({
      where: { companyId, tenantId, deletedAt: null },
      select: { id: true, name: true, department: true, workSiteId: true },
    })
    const idx = new Map<string, { id: string; name: string }>()
    for (const w of wps) {
      idx.set(wpIndexKey(w.workSiteId, w.name), { id: w.id, name: w.name })
      if (w.department) idx.set(wpIndexKey(w.workSiteId, w.department), { id: w.id, name: w.name })
    }
    workplaceIndexByCompany.set(companyId, idx)
    return idx
  }

  async function getWorkSiteIndex(companyId: string) {
    const cached = workSiteIndexByCompany.get(companyId)
    if (cached) return cached
    const sites = await prisma.workSite.findMany({
      where: { companyId, tenantId, deletedAt: null },
      select: { id: true, name: true },
    })
    const idx = new Map<string, { id: string; name: string }>()
    for (const s of sites) idx.set(workplaceKey(s.name), { id: s.id, name: s.name })
    workSiteIndexByCompany.set(companyId, idx)
    return idx
  }

  // Find-or-create a WorkSite (punct de lucru) under a company. Same normalize
  // + P2002-race handling as workplaces.
  async function resolveWorkSite(
    companyId: string,
    label: string
  ): Promise<{ id: string; created: boolean }> {
    const idx = await getWorkSiteIndex(companyId)
    const key = workplaceKey(label)
    const found = idx.get(key)
    if (found) return { id: found.id, created: false }

    const name = normalizeWorkplaceValue(label)
    let site: { id: string }
    try {
      site = await prisma.workSite.create({
        data: { companyId, tenantId, name, isActive: true, importJobId, createdByUserId: userId },
        select: { id: true },
      })
      workSitesCreated++
      newWorkSiteNames.push(name)
    } catch (createErr) {
      if ((createErr as { code?: string }).code !== 'P2002') throw createErr
      const winner = await prisma.workSite.findFirst({
        where: { companyId, tenantId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      })
      if (!winner) throw createErr
      site = winner
    }
    idx.set(key, { id: site.id, name })
    return { id: site.id, created: true }
  }

  // Find-or-create a workplace under a company + (optional) site
  // (import spec §5.1 / §5.2). Two workplaces with the same name under
  // different sites are distinct rows.
  async function resolveWorkplace(
    companyId: string,
    workSiteId: string | null,
    label: string,
    departmentForNew: string | null
  ): Promise<{ id: string; created: boolean }> {
    const idx = await getWorkplaceIndex(companyId)
    const key = wpIndexKey(workSiteId, label)
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
          workSiteId,
          name,
          department: dept,
          isActive: true,
          importJobId,
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
          workSiteId: workSiteId ?? null,
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

      // ── 2. Resolve work site (punct de lucru), then workplace ───────
      // The punct de lucru column, when present, becomes/finds a WorkSite
      // under the company; the workplace is then found/created within it, so
      // the same activity name at two sites yields two distinct workplaces.
      let resolvedWorkSiteId: string | null = null
      if (row.workSiteName && resolvedCompanyId) {
        const ws = await resolveWorkSite(resolvedCompanyId, row.workSiteName)
        resolvedWorkSiteId = ws.id
      }

      let resolvedWorkplaceId: string | null = null
      // A workplace column wins; otherwise a department value stands in for
      // the workplace. The department text is carried onto a freshly created
      // workplace (spec §5.1).
      const wpLabel = row.workplaceName ?? row.department
      const departmentForNew = row.department

      if (wpLabel && resolvedCompanyId) {
        const wp = await resolveWorkplace(
          resolvedCompanyId,
          resolvedWorkSiteId,
          wpLabel,
          departmentForNew
        )
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
      let parsedHireDate: Date | null = null
      if (row.hireDate) {
        const p = parseFlexibleDate(row.hireDate)
        if (p.status === 'valid' && !isFutureDate(p.date)) parsedHireDate = p.date
      }
      const startDate = parsedHireDate ?? new Date()

      // ── 4a. UPDATE existing employee in place (prompt-import-update.md) ─
      // When the operator chose "update existing" and this row matches an
      // existing employee, overwrite the changed fields instead of skipping.
      // Everything for one employee runs in ONE transaction; nothing is ever
      // deleted. Precedence: updateExisting wins over skipIfDuplicate.
      if (duplicate && row.updateExisting) {
        const today = new Date()
        const upd = await prisma.$transaction(async (tx) => {
          const existing = await tx.employee.findFirst({
            where: { id: duplicate, tenantId, deletedAt: null },
            select: {
              id: true,
              companyId: true,
              companyEmployeeId: true,
              jobTitle: true,
              email: true,
              phone: true,
              city: true,
              notes: true,
              employerRequirements: true,
            },
          })
          // Vanished between pre-load and now (soft-deleted concurrently).
          if (!existing) return null

          // Scalar fields — only non-empty, genuinely different values. An empty
          // cell never erases (computeEmployeeFieldUpdates), employerRequirements
          // included.
          const { data, changed, changes } = computeEmployeeFieldUpdates(
            {
              companyEmployeeId: existing.companyEmployeeId,
              jobTitle: existing.jobTitle,
              email: existing.email,
              phone: existing.phone,
              city: existing.city,
              notes: existing.notes,
              employerRequirements: existing.employerRequirements,
            },
            {
              companyEmployeeId: row.companyEmployeeId,
              jobTitle: row.jobTitle,
              email: row.email,
              phone: row.phone,
              city: row.city,
              notes: row.notes,
              employerRequirements: row.employerRequirements,
            }
          )
          const changedFields: string[] = [...changed]
          const auditChanges: Record<string, { old: unknown; new: unknown }> = {}
          for (const f of changed) {
            const c = changes[f as UpdatableEmployeeField]
            if (c) auditChanges[f] = { old: c.old, new: c.new }
          }

          const employeeData: Prisma.EmployeeUpdateInput = { ...data }
          // Attach the resolved company only when the employee has none —
          // never silently move an employee to a different company.
          if (!existing.companyId && resolvedCompanyId) {
            employeeData.company = { connect: { id: resolvedCompanyId } }
            changedFields.push('company')
          }

          // ── Workplace assignment ──────────────────────────────────────
          if (resolvedWorkplaceId) {
            const current = await tx.employeeWorkplaceAssignment.findFirst({
              where: { employeeId: existing.id, isCurrent: true },
              select: { id: true, workplaceId: true, startDate: true },
            })
            if (!current) {
              // No assignment yet — just create one (spec: "just create one").
              await tx.employeeWorkplaceAssignment.create({
                data: {
                  tenantId,
                  employeeId: existing.id,
                  workplaceId: resolvedWorkplaceId,
                  startDate,
                  isCurrent: true,
                  reasonForChange: 'hired',
                },
              })
              changedFields.push('workplace')
              auditChanges.workplace = { old: null, new: resolvedWorkplaceId }
            } else if (current.workplaceId !== resolvedWorkplaceId) {
              // Workplace changed — close the old assignment (NEVER delete)
              // and open a new current one on the new workplace.
              await tx.employeeWorkplaceAssignment.update({
                where: { id: current.id },
                data: { isCurrent: false, endDate: today },
              })
              await tx.employeeWorkplaceAssignment.create({
                data: {
                  tenantId,
                  employeeId: existing.id,
                  workplaceId: resolvedWorkplaceId,
                  startDate: today,
                  isCurrent: true,
                  reasonForChange: 'department_change',
                },
              })
              // Pending/overdue recalls on the OLD workplace follow the
              // employee to the new one. Completed recalls stay untouched.
              await tx.recall.updateMany({
                where: {
                  tenantId,
                  employeeId: existing.id,
                  workplaceId: current.workplaceId,
                  status: { in: ['pending', 'overdue'] },
                  deletedAt: null,
                },
                data: { workplaceId: resolvedWorkplaceId },
              })
              changedFields.push('workplace')
              auditChanges.workplace = { old: current.workplaceId, new: resolvedWorkplaceId }
            } else if (
              parsedHireDate &&
              current.startDate.getTime() !== parsedHireDate.getTime()
            ) {
              // Same workplace, but the file carries a different (valid) hire
              // date — correct the current assignment's start date.
              await tx.employeeWorkplaceAssignment.update({
                where: { id: current.id },
                data: { startDate: parsedHireDate },
              })
              changedFields.push('hireDate')
              auditChanges.hireDate = {
                old: current.startDate.toISOString().slice(0, 10),
                new: parsedHireDate.toISOString().slice(0, 10),
              }
            }
          }

          if (Object.keys(employeeData).length > 0) {
            await tx.employee.update({ where: { id: existing.id }, data: employeeData })
          }

          return { employeeId: existing.id, changedFields, auditChanges }
        })

        if (!upd) {
          // Employee disappeared — treat as a skip, not a failure.
          results.push({
            rowNumber: row.rowNumber,
            outcome: 'skipped',
            reason: 'duplicate_vanished',
          })
          skipped++
          continue
        }

        if (upd.changedFields.length === 0) {
          // Nothing actually differed — keep the import idempotent (spec §5):
          // a re-run of the same file reports 0 updates.
          results.push({
            rowNumber: row.rowNumber,
            outcome: 'skipped',
            reason: 'no_changes',
            duplicateEmployeeId: upd.employeeId,
            warning: rowWarning,
          })
          skipped++
          continue
        }

        // One audit entry per updated employee, old → new (never any CNP).
        void writeAuditLog({
          tenantId,
          userId,
          action: 'update',
          entityType: 'employee',
          entityId: upd.employeeId,
          entitySummary: `Actualizat din import „${fileName ?? 'fișier'}" — ${upd.changedFields.join(', ')}`,
          changes: { importJobId, fields: upd.auditChanges },
          ipAddress: requestMeta.ipAddress,
          userAgent: requestMeta.userAgent,
        })

        results.push({
          rowNumber: row.rowNumber,
          outcome: 'updated',
          employeeId: upd.employeeId,
          changed: upd.changedFields,
          warning: rowWarning,
        })
        updated++
        continue
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
            employerRequirements: row.employerRequirements,
            city: row.city,
            email: row.email,
            notes: row.notes,
            nationality: 'RO',
            isActive: true,
            importJobId,
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
                importJob: { connect: { id: importJobId } },
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

  // Compute anomaly flags for THIS batch's contribution.
  const flags: string[] = []
  if (rowsWithoutWorkplace > 0 && anyRowHadWorkplaceName)
    flags.push('workplace_data_present_but_unassigned')
  if (created === 0 && updated === 0 && rows.length > 0) flags.push('zero_rows_created')
  if (failed > rows.length * 0.5) flags.push('high_failure_rate')
  if (companiesCreated > 0 && fallbackCompanyId) flags.push('unexpected_company_creation')
  if (anyCnp && !encryptionConfigured) flags.push('cnp_encryption_not_configured')
  if (anyFitness && !controlPeriodicTypeId) flags.push('recall_type_missing')

  // Fold this batch into the ImportJob: increment the counters, append the
  // (PII-free) per-row results, merge flags, and — only on the final batch —
  // flip the job to 'completed'. Done synchronously so the history page and
  // the batch-to-batch handoff always see a consistent row.
  try {
    const current = await prisma.importJob.findUnique({
      where: { id: importJobId },
      select: { results: true, flags: true },
    })
    const mergedResults = [...((current?.results as RowOutcome[] | null) ?? []), ...results]
    const mergedFlags = Array.from(
      new Set([...((current?.flags as string[] | null) ?? []), ...flags])
    )
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        created: { increment: created },
        updated: { increment: updated },
        skipped: { increment: skipped },
        failed: { increment: failed },
        companiesCreated: { increment: companiesCreated },
        workplacesCreated: { increment: workplacesCreated },
        rowsWithoutCompany: { increment: rowsWithoutCompany },
        rowsWithoutWorkplace: { increment: rowsWithoutWorkplace },
        results: mergedResults as unknown as Prisma.InputJsonValue,
        flags: mergedFlags.length > 0 ? mergedFlags : undefined,
        ...(isFinalBatch ? { status: 'completed', finishedAt: new Date() } : {}),
      },
    })
  } catch (err) {
    console.error('[import] Failed to update ImportJob:', err)
  }

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
    importJobId,
    summary: {
      total: rows.length,
      created,
      updated,
      skipped,
      failed,
      companiesCreated,
      workplacesCreated,
      workSitesCreated,
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
    workSitesCreated: newWorkSiteNames,
  })
}
