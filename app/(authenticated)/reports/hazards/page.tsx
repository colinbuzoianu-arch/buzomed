import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import {
  ALL_DATE_RANGES,
  parseDateRange,
  resolveDateRange,
} from '@/lib/reports/date-ranges'
import {
  parseRiskProfile,
  RISK_PROFILE_SCHEMA,
} from '@/lib/workplaces/risk-profile'
import Link from 'next/link'

interface PageProps {
  searchParams: Promise<{ range?: string }>
}

export default async function HazardsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const hasReportingRole = user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )
  if (!hasReportingRole) redirect('/')

  const sp = await searchParams
  const rangeKey = parseDateRange(sp.range)
  const range = resolveDateRange(rangeKey)

  const workplaces = await prisma.workplace.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      riskProfile: true,
      company: { select: { id: true, name: true } },
      employeeAssignments: {
        where: { isCurrent: true, employee: { deletedAt: null } },
        select: { employeeId: true },
      },
      examinations: {
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          createdAt: { gte: range.from, lt: range.to },
          status: { notIn: ['cancelled', 'no_show'] },
        },
        select: { id: true },
      },
    },
  })

  // Build aggregation: category → hazardKey → { workplaceIds, workerIds, examCount }
  type HazardAgg = {
    category: string
    hazardKey: string
    workplaceIds: Set<string>
    workerIds: Set<string>
    examCount: number
  }

  const hazardMap = new Map<string, HazardAgg>()

  for (const wp of workplaces) {
    const rp = parseRiskProfile(wp.riskProfile)
    for (const { category, hazards } of RISK_PROFILE_SCHEMA) {
      for (const hazardKey of hazards) {
        const entry = (rp[category] as Record<string, { present: boolean }>)[hazardKey]
        if (!entry?.present) continue

        const key = `${category}:${hazardKey}`
        const agg = hazardMap.get(key) ?? {
          category,
          hazardKey,
          workplaceIds: new Set(),
          workerIds: new Set(),
          examCount: 0,
        }
        agg.workplaceIds.add(wp.id)
        for (const a of wp.employeeAssignments) agg.workerIds.add(a.employeeId)
        agg.examCount += wp.examinations.length
        hazardMap.set(key, agg)
      }
    }
  }

  const rows = Array.from(hazardMap.values())
    .sort((a, b) => {
      const catOrder = RISK_PROFILE_SCHEMA.findIndex((s) => s.category === a.category)
      const catOrderB = RISK_PROFILE_SCHEMA.findIndex((s) => s.category === b.category)
      if (catOrder !== catOrderB) return catOrder - catOrderB
      return b.workerIds.size - a.workerIds.size
    })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{t('reports.hazards.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('reports.hazards.subtitle')}</p>
      </div>

      {/* Range selector */}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="text-muted-foreground self-center mr-1">{t('reports.range.label')}:</span>
        {ALL_DATE_RANGES.map((key) => (
          <Link
            key={key}
            href={`/reports/hazards?range=${key}`}
            className={`px-3 py-1 rounded-md border transition-colors ${
              rangeKey === key ? 'bg-secondary font-medium' : 'hover:bg-muted'
            }`}
          >
            {t(`reports.range.${key}`)}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{t('reports.hazards.empty')}</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">{t('reports.hazards.colCategory')}</th>
                <th className="text-left px-4 py-2">{t('reports.hazards.colHazard')}</th>
                <th className="text-right px-4 py-2">{t('reports.hazards.colWorkplaces')}</th>
                <th className="text-right px-4 py-2">{t('reports.hazards.colWorkers')}</th>
                <th className="text-right px-4 py-2">{t('reports.hazards.colExams')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={`${row.category}:${row.hazardKey}`}>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {t(`workplaces.form.hazardCategory.${row.category}`)}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    {t(`workplaces.form.hazardName.${row.hazardKey}`)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.workplaceIds.size}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {row.workerIds.size}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {row.examCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
