import Link from 'next/link'
import { FileDown } from 'lucide-react'
import { Pagination } from '@/components/ui/pagination'
import { VerdictBadge } from '@/components/ui/verdict-badge'
import { formatDate } from '@/lib/format-date'
import { avizePdfReady, buildAvizeWhere, readAvizeFilters } from '@/lib/examinations/avize-filters'
import { resolveExaminationDate } from '@/lib/examinations/examined-at'
import { prisma } from '@/lib/prisma'
import { formatWorkplaceLabel } from '@/lib/workplaces/format'
import { AvizeFilterBar, type AvizeFilterLabels } from './avize-filter-bar'

const EXAMINATIONS_PATH = '/examinations'
const AVIZE_PAGE_SIZE = 100

function buildQuery(
  searchParams: Record<string, string | undefined>,
  extra: Record<string, string> = {}
): string {
  const p = new URLSearchParams(extra)
  for (const key of ['period', 'from', 'to', 'companyId', 'verdict', 'retrase'] as const) {
    const v = searchParams[key]
    if (v) p.set(key, v)
  }
  return p.toString()
}

export default async function AvizeView(props: {
  tenantId: string
  locale: 'ro' | 'en'
  t: (k: string) => string
  page: number
  searchParams: Record<string, string | undefined>
}) {
  const t = props.t
  const filters = readAvizeFilters(props.searchParams)
  const where = buildAvizeWhere(props.tenantId, filters)

  const [rows, total, companies] = await Promise.all([
    prisma.examination.findMany({
      where,
      orderBy: [{ signedAt: 'desc' }],
      skip: (props.page - 1) * AVIZE_PAGE_SIZE,
      take: AVIZE_PAGE_SIZE,
      select: {
        id: true,
        examinationNumber: true,
        examinedAt: true,
        completedAt: true,
        createdAt: true,
        verdict: true,
        verdictConditions: true,
        nextExaminationDueDate: true,
        revokedAt: true,
        employee: { select: { firstName: true, lastName: true } },
        workplace: {
          select: {
            name: true,
            company: { select: { name: true } },
            workSite: { select: { name: true } },
          },
        },
        examinationType: { select: { nameRo: true, nameEn: true } },
        practitioner: { select: { firstName: true, lastName: true } },
        supersededBy: { select: { id: true, examinationNumber: true } },
      },
    }),
    prisma.examination.count({ where }),
    prisma.company.findMany({
      where: { tenantId: props.tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const labels: AvizeFilterLabels = {
    period: t('examinations.filters.period'),
    periods: {
      azi: t('examinations.filters.periods.azi'),
      '7zile': t('examinations.filters.periods.7zile'),
      luna: t('examinations.filters.periods.luna'),
      luna_trecuta: t('examinations.filters.periods.luna_trecuta'),
      an: t('examinations.filters.periods.an'),
      custom: t('examinations.filters.periods.custom'),
    },
    company: t('examinations.filters.company'),
    verdict: t('examinations.filters.verdict'),
    verdicts: {
      apt: t('examinations.filters.verdicts.apt'),
      apt_conditionat: t('examinations.filters.verdicts.apt_conditionat'),
      inapt_temporar: t('examinations.filters.verdicts.inapt_temporar'),
      inapt: t('examinations.filters.verdicts.inapt'),
    },
    from: t('examinations.filters.from'),
    to: t('examinations.filters.to'),
    includeRevoked: t('examinations.avize.includeRevoked'),
    exportCsv: t('examinations.exportCsv'),
    downloadAll: t('examinations.avize.downloadAll'),
    downloadAllHint: t('examinations.avize.downloadAllHint'),
  }

  const exportHref = `/api/examinations/export?${buildQuery(props.searchParams, { register: 'avize' })}`
  const pdfHref = `/api/examinations/avize-pdf?${buildQuery(props.searchParams)}`
  const totalPages = Math.ceil(total / AVIZE_PAGE_SIZE)

  return (
    <div className="space-y-4">
      <AvizeFilterBar
        companies={companies}
        labels={labels}
        values={{
          period: filters.period,
          from: filters.from,
          to: filters.to,
          companyId: filters.companyId,
          verdict: filters.verdict,
          includeRevoked: filters.includeRevoked,
        }}
        exportHref={exportHref}
        pdfHref={pdfHref}
        pdfReady={avizePdfReady(filters)}
      />

      {rows.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <p className="text-sm text-muted-foreground">{t('examinations.avize.empty')}</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">{t('examinations.avize.colNumber')}</th>
                <th className="text-left px-3 py-2">{t('examinations.avize.colDate')}</th>
                <th className="text-left px-3 py-2">{t('examinations.avize.colWorker')}</th>
                <th className="text-left px-3 py-2">{t('examinations.avize.colCompany')}</th>
                <th className="text-left px-3 py-2">{t('examinations.avize.colWorkplace')}</th>
                <th className="text-left px-3 py-2">{t('examinations.avize.colType')}</th>
                <th className="text-left px-3 py-2">{t('examinations.avize.colVerdict')}</th>
                <th className="text-left px-3 py-2">{t('examinations.avize.colConditions')}</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">
                  {t('examinations.avize.colValidUntil')}
                </th>
                <th className="text-left px-3 py-2">{t('examinations.avize.colDoctor')}</th>
                <th className="text-right px-3 py-2">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((e) => {
                const revoked = e.revokedAt !== null
                const type =
                  props.locale === 'en'
                    ? (e.examinationType.nameEn ?? e.examinationType.nameRo)
                    : e.examinationType.nameRo
                return (
                  <tr key={e.id} className={revoked ? 'bg-destructive/5' : undefined}>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs">
                      <Link href={`/examinations/${e.id}`} className="hover:underline">
                        <span className={revoked ? 'line-through text-muted-foreground' : ''}>
                          {e.examinationNumber}
                        </span>
                      </Link>
                      {revoked && (
                        <span className="ml-1.5 inline-flex items-center rounded border border-destructive/30 bg-destructive/10 px-1 text-[10px] font-medium text-destructive">
                          {t('examinations.avize.revoked')}
                        </span>
                      )}
                      {revoked && e.supersededBy && (
                        <Link
                          href={`/examinations/${e.supersededBy.id}`}
                          className="ml-1 text-[10px] text-primary hover:underline"
                        >
                          → {e.supersededBy.examinationNumber}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {formatDate(resolveExaminationDate(e), 'short', props.locale)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {e.employee.lastName} {e.employee.firstName}
                    </td>
                    <td className="px-3 py-2.5">{e.workplace.company.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatWorkplaceLabel(e.workplace)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{type}</td>
                    <td className="px-3 py-2.5">
                      {e.verdict && <VerdictBadge verdict={e.verdict} />}
                    </td>
                    <td className="px-3 py-2.5 max-w-[180px]">
                      {e.verdictConditions ? (
                        <span className="block truncate text-muted-foreground" title={e.verdictConditions}>
                          {e.verdictConditions}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {e.nextExaminationDueDate
                        ? formatDate(e.nextExaminationDueDate, 'short', props.locale)
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {e.practitioner
                        ? `${e.practitioner.lastName} ${e.practitioner.firstName}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <a
                        href={`/api/examinations/${e.id}/fisa-pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-primary hover:text-primary/80"
                        aria-label={t('examinations.avize.downloadOne')}
                        title={t('examinations.avize.downloadOne')}
                      >
                        <FileDown className="h-4 w-4" />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        href={EXAMINATIONS_PATH}
        params={props.searchParams}
        paramName="page"
        page={props.page}
        totalPages={totalPages}
      />
    </div>
  )
}
