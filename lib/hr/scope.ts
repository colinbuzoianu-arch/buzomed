import { prisma } from '@/lib/prisma'

/**
 * Resolves the set of companies a `company_hr` user may see, and the single
 * tenant they belong to.
 *
 * Shared by every HR-portal entry point (the dashboard page, the dashboard
 * route and the stats route) so the tenant-scoping rule lives in exactly one
 * place and can never drift between them.
 *
 * A single HR user is only ever expected to belong to one tenant. If their
 * assignments somehow span tenants we fail loudly rather than silently drop
 * data — a cross-tenant leak is far worse than an error on screen.
 */
export type HrScope =
  | {
      ok: true
      tenantId: string
      companyIds: string[]
      companies: Array<{ id: string; name: string; city: string | null }>
    }
  | { ok: false; error: 'no_assignments' | 'multi_tenant' }

export async function resolveHrScope(userId: string): Promise<HrScope> {
  const assignments = await prisma.companyHrAssignment.findMany({
    where: { userId },
    select: {
      companyId: true,
      tenantId: true,
      company: { select: { id: true, name: true, city: true } },
    },
  })

  if (assignments.length === 0) return { ok: false, error: 'no_assignments' }

  const tenantIds = new Set(assignments.map((a) => a.tenantId))
  if (tenantIds.size > 1) {
    console.error('[hr/scope] multi-tenant HR user detected', {
      userId,
      tenantIds: [...tenantIds],
    })
    return { ok: false, error: 'multi_tenant' }
  }

  return {
    ok: true,
    tenantId: assignments[0].tenantId,
    companyIds: assignments.map((a) => a.companyId),
    companies: assignments.map((a) => a.company),
  }
}
