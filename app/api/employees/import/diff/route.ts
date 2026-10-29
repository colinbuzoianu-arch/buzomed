import { type NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { isCnpEncryptionConfigured } from '@/lib/crypto/cnp-cipher'
import { hashCnp } from '@/lib/crypto/cnp-hash'
import { validateCnp } from '@/lib/crypto/cnp-validation'
import { getOrCreateTenantCnpSalt } from '@/lib/crypto/tenant-salt'
import {
  normalizeCnpInput,
  normalizeWorkplaceValue,
  workplaceKey,
} from '@/lib/employees/import-normalize'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { logSystemError } from '@/lib/system-log/error-log'
import { asObject } from '@/lib/validation'
import { formatWorkplaceLabel } from '@/lib/workplaces/format'

/**
 * Roster diff endpoint.
 *
 * Given a companyId and a list of rows from the import file, compares
 * against the company's current active employee roster and returns a
 * categorized diff:
 *
 *   - new      : in the file, no matching employee currently at this company
 *   - leaving  : currently at this company, not matched by any file row
 *   - moved    : matched in both, but the file's workplace (resolved exactly
 *                like the commit route — workplaceName ?? department, same
 *                normalization, including workplaces that would be CREATED)
 *                differs from the one currently assigned
 *   - unchanged: matched, same workplace (or the row carries no workplace)
 *
 * Matching order (identical to the commit route):
 *   1. cnpHash
 *   2. normalized firstName + lastName
 *   3. email
 *
 * The "leaving" category is informational only — the caller should show
 * a disclaimer that this list may simply reflect a partial roster upload
 * rather than actual departures. The commit route does NOT archive them.
 */

interface InputRow {
  rowNumber: number
  firstName: string | null
  lastName: string | null
  email: string | null
  companyEmployeeId: string | null
  department: string | null
  workplaceName: string | null
  workSiteName: string | null
  cnp: string | null
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
  const companyId = typeof body.companyId === 'string' ? body.companyId : null
  const rowsInput = Array.isArray(body.rows) ? body.rows : []

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  }

  try {
    const company = await prisma.company.findFirst({
      where: { id: companyId, tenantId: auth.user.tenantId, deletedAt: null },
      select: {
        id: true,
        workplaces: {
          where: { deletedAt: null, isActive: true },
          select: {
            id: true,
            name: true,
            department: true,
            workSiteId: true,
            workSite: { select: { name: true } },
          },
        },
        workSites: {
          where: { deletedAt: null, isActive: true },
          select: { id: true, name: true },
        },
      },
    })
    if (!company) {
      return NextResponse.json({ error: 'company_not_found' }, { status: 404 })
    }

    // Workplace/site resolver — the SAME find-or-create logic the commit route
    // uses. Workplace identity is (workSiteId, normalized name), so the lookup
    // key namespaces the name under its site. A punct-de-lucru value resolves
    // to an existing WorkSite or, failing that, signals a site the commit
    // would create (in which case the workplace is necessarily new → "moved").
    const siteIndex = new Map<string, { id: string; name: string }>()
    for (const s of company.workSites) siteIndex.set(workplaceKey(s.name), { id: s.id, name: s.name })

    const wpKey = (workSiteId: string | null, label: string) =>
      `${workSiteId ?? ''}|${workplaceKey(label)}`

    const workplaceIndex = new Map<string, { id: string; name: string }>()
    for (const w of company.workplaces) {
      workplaceIndex.set(wpKey(w.workSiteId, w.name), { id: w.id, name: w.name })
      if (w.department) workplaceIndex.set(wpKey(w.workSiteId, w.department), { id: w.id, name: w.name })
    }

    // A comparison key stable across existing + would-be-created workplaces.
    // `label` is the combined "{workplace} / {site}" display text.
    interface ResolvedTarget {
      compareKey: string
      label: string
    }
    function resolveWorkplace(
      workplaceName: string | null,
      department: string | null,
      workSiteName: string | null
    ): ResolvedTarget | null {
      const wpLabel = workplaceName ?? department
      if (!wpLabel) return null

      // Resolve the site first (like commit). An unknown site name means the
      // commit would create it, so the workplace under it is necessarily new:
      // use a sentinel compareKey that can never equal an existing one.
      let siteId: string | null = null
      let siteName: string | null = null
      let siteIsNew = false
      if (workSiteName) {
        const foundSite = siteIndex.get(workplaceKey(workSiteName))
        if (foundSite) {
          siteId = foundSite.id
          siteName = foundSite.name
        } else {
          siteIsNew = true
          siteName = normalizeWorkplaceValue(workSiteName)
        }
      }

      const name = normalizeWorkplaceValue(wpLabel)
      const label = formatWorkplaceLabel({
        name,
        workSite: siteName ? { name: siteName } : null,
      })
      if (siteIsNew) {
        // Brand-new site ⇒ brand-new workplace; unique, never matches current.
        return { compareKey: `\u0000new-site\u0000${workplaceKey(workSiteName ?? '')}|${workplaceKey(name)}`, label }
      }
      const found = workplaceIndex.get(wpKey(siteId, wpLabel))
      if (found) return { compareKey: `id:${found.id}`, label }
      // Workplace the commit would create under an existing/absent site.
      return { compareKey: wpKey(siteId, name), label }
    }

    // Load current active employees at this company via their current assignments
    const currentAssignments = await prisma.employeeWorkplaceAssignment.findMany({
      where: {
        tenantId: auth.user.tenantId,
        isCurrent: true,
        workplace: { companyId, deletedAt: null },
        employee: { deletedAt: null, isActive: true },
      },
      select: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            companyEmployeeId: true,
            cnpHash: true,
          },
        },
        workplace: {
          select: {
            id: true,
            name: true,
            workSiteId: true,
            workSite: { select: { name: true } },
          },
        },
      },
    })

    type Assignment = (typeof currentAssignments)[0]

    const currentByName = new Map<string, Assignment>()
    const currentByEmail = new Map<string, Assignment>()
    const currentByCnpHash = new Map<string, Assignment>()
    for (const a of currentAssignments) {
      const nameKey = `${a.employee.firstName.toLowerCase()}|${a.employee.lastName.toLowerCase()}`
      currentByName.set(nameKey, a)
      if (a.employee.email) {
        currentByEmail.set(a.employee.email.toLowerCase(), a)
      }
      if (a.employee.cnpHash) {
        currentByCnpHash.set(a.employee.cnpHash, a)
      }
    }

    // Parse input rows
    const rows: InputRow[] = rowsInput.map((r: unknown, i: number) => {
      const obj = asObject(r) ?? {}
      const cnpRaw =
        typeof obj.cnp === 'string' && obj.cnp.trim() ? normalizeCnpInput(obj.cnp) : null
      return {
        rowNumber: typeof obj.rowNumber === 'number' ? obj.rowNumber : i + 2,
        firstName: typeof obj.firstName === 'string' ? obj.firstName.trim() || null : null,
        lastName: typeof obj.lastName === 'string' ? obj.lastName.trim() || null : null,
        email: typeof obj.email === 'string' ? obj.email.trim().toLowerCase() || null : null,
        companyEmployeeId:
          typeof obj.companyEmployeeId === 'string' ? obj.companyEmployeeId.trim() || null : null,
        department: typeof obj.department === 'string' ? obj.department.trim() || null : null,
        workplaceName:
          typeof obj.workplaceName === 'string' ? obj.workplaceName.trim() || null : null,
        workSiteName:
          typeof obj.workSiteName === 'string' ? obj.workSiteName.trim() || null : null,
        cnp: cnpRaw || null,
      }
    })

    // Resolve the tenant salt once so we can match incoming CNPs against the
    // stored cnpHash FIRST (import spec §1). Only valid CNPs are hashed; a
    // salt is computed lazily and only when the file actually carries CNPs.
    let salt: string | null = null
    if (rows.some((r) => r.cnp) && isCnpEncryptionConfigured()) {
      try {
        salt = await getOrCreateTenantCnpSalt(auth.user.tenantId)
      } catch {
        salt = null // fall back to name/email matching
      }
    }
    function cnpHashFor(cnp: string | null): string | null {
      if (!cnp || !salt) return null
      return validateCnp(cnp).valid ? hashCnp(cnp, salt) : null
    }

    // Categorize each file row
    const matchedIds = new Set<string>()
    const newEmployees: Array<{
      rowNumber: number
      firstName: string
      lastName: string
      toWorkplace: string | null
    }> = []
    const movedEmployees: Array<{
      rowNumber: number
      firstName: string
      lastName: string
      fromWorkplace: string
      toWorkplace: string
    }> = []
    let unchanged = 0

    for (const row of rows) {
      if (!row.firstName || !row.lastName) continue

      // Matching order identical to the commit route: cnpHash → name → email.
      let match: Assignment | null = null
      const rowCnpHash = cnpHashFor(row.cnp)
      if (rowCnpHash) {
        match = currentByCnpHash.get(rowCnpHash) ?? null
      }
      if (!match) {
        const nameKey = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}`
        match = currentByName.get(nameKey) ?? null
      }
      if (!match && row.email) {
        match = currentByEmail.get(row.email) ?? null
      }

      const target = resolveWorkplace(row.workplaceName, row.department, row.workSiteName)

      if (!match) {
        newEmployees.push({
          rowNumber: row.rowNumber,
          firstName: row.firstName,
          lastName: row.lastName,
          toWorkplace: target?.label ?? null,
        })
      } else {
        matchedIds.add(match.employee.id)
        const currentWp = match.workplace
        // Same workplace when the resolved target's compareKey equals the
        // current assignment's — both namespaced by (site, name), so moving
        // the same activity to a different site counts as a move.
        const currentKey = `id:${currentWp.id}`
        const sameWorkplace = target != null && target.compareKey === currentKey
        if (target && !sameWorkplace) {
          movedEmployees.push({
            rowNumber: row.rowNumber,
            firstName: match.employee.firstName,
            lastName: match.employee.lastName,
            fromWorkplace: formatWorkplaceLabel(currentWp),
            toWorkplace: target.label,
          })
        } else {
          unchanged++
        }
      }
    }

    const leavingEmployees = currentAssignments
      .filter((a) => !matchedIds.has(a.employee.id))
      .map((a) => ({
        id: a.employee.id,
        firstName: a.employee.firstName,
        lastName: a.employee.lastName,
        workplace: formatWorkplaceLabel(a.workplace),
      }))

    return NextResponse.json({
      currentCount: currentAssignments.length,
      new: newEmployees,
      leaving: leavingEmployees,
      moved: movedEmployees,
      unchanged,
    })
  } catch (err) {
    void logSystemError({
      tenantId: auth.user.tenantId,
      route: '/api/employees/import/diff',
      method: 'POST',
      error: err,
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
