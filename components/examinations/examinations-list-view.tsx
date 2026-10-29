import type { ExaminationStatus } from '@prisma/client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ExaminationStatusBadge } from '@/components/ui/examination-status-badge'
import { Pagination } from '@/components/ui/pagination'
import { formatDate } from '@/lib/format-date'
import {
  buildExaminationListWhere,
  hasActiveExamFilters,
  readExamListFilters,
} from '@/lib/examinations/list-filters'
import { prisma } from '@/lib/prisma'
import { formatWorkplaceLabel } from '@/lib/workplaces/format'
import {
  ExaminationsFilterBar,
  type FilterBarLabels,
} from './examinations-filter-bar'

const EXAMINATIONS_PATH = '/examinations'
const LIST_PAGE_SIZE = 200

export default async function ExaminationsListView(props: {
  tenantId: string
  status: ExaminationStatus | null
  tab: string
  locale: 'ro' | 'en'
  canWrite: boolean
  t: (k: string) => string
  page: number
  searchParams: Record<string, string | undefined>
}) {
  const t = props.t
  const filters = readExamListFilters(props.searchParams)

  const where = await buildExaminationListWhere(props.tenantId, props.status, filters)

  const [examinations, total, types, companies, practitioners] = await Promise.all([
    prisma.examination.findMany({
      where,
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      skip: (props.page - 1) * LIST_PAGE_SIZE,
      take: LIST_PAGE_SIZE,
      select: {
        id: true,
        examinationNumber: true,
        status: true,
        scheduledAt: true,
        startedAt: true,
        completedAt: true,
        signedAt: true,
        employee: { select: { id: true, firstName: true, lastName: true } },
        workplace: {
          select: {
            id: true,
            name: true,
            company: { select: { id: true, name: true } },
            workSite: { select: { name: true } },
          },
        },
        examinationType: { select: { nameRo: true, nameEn: true, code: true } },
      },
    }),
    prisma.examination.count({ where }),
    prisma.examinationType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameRo: 'asc' }],
      select: { id: true, nameRo: true, nameEn: true },
    }),
    prisma.company.findMany({
      where: { tenantId: props.tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: {
        tenantId: props.tenantId,
        isActive: true,
        deletedAt: null,
        roles: { hasSome: ['practitioner', 'practice_admin'] },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, professionalTitle: true },
    }),
  ])

  // Build the export URL from the active filters + current tab status.
  const exportParams = new URLSearchParams()
  if (props.status) exportParams.set('status', props.status)
  for (const key of [
    'period',
    'from',
    'to',
    'type',
    'verdict',
    'companyId',
    'practitionerId',
    'sign',
    'search',
  ] as const) {
    const v = props.searchParams[key]
    if (v) exportParams.set(key, v)
  }
  const exportHref = `/api/examinations/export?${exportParams.toString()}`

  const filterLabels: FilterBarLabels = {
    searchPlaceholder: t('examinations.filters.searchPlaceholder'),
    exportCsv: t('examinations.exportCsv'),
    clearAll: t('examinations.filters.clearAll'),
    period: t('examinations.filters.period'),
    periods: {
      azi: t('examinations.filters.periods.azi'),
      '7zile': t('examinations.filters.periods.7zile'),
      luna: t('examinations.filters.periods.luna'),
      luna_trecuta: t('examinations.filters.periods.luna_trecuta'),
      an: t('examinations.filters.periods.an'),
      custom: t('examinations.filters.periods.custom'),
    },
    type: t('examinations.filters.type'),
    verdict: t('examinations.filters.verdict'),
    verdicts: {
      apt: t('examinations.filters.verdicts.apt'),
      apt_conditionat: t('examinations.filters.verdicts.apt_conditionat'),
      inapt_temporar: t('examinations.filters.verdicts.inapt_temporar'),
      inapt: t('examinations.filters.verdicts.inapt'),
      none: t('examinations.filters.verdicts.none'),
    },
    company: t('examinations.filters.company'),
    practitioner: t('examinations.filters.practitioner'),
    sign: t('examinations.filters.sign'),
    signs: {
      semnate: t('examinations.filters.signs.semnate'),
      nesemnate: t('examinations.filters.signs.nesemnate'),
      retrase: t('examinations.filters.signs.retrase'),
    },
    from: t('examinations.filters.from'),
    to: t('examinations.filters.to'),
  }

  const filterBar = (
    <ExaminationsFilterBar
      options={{
        types: types.map((ty) => ({
          id: ty.id,
          name: props.locale === 'en' ? (ty.nameEn ?? ty.nameRo) : ty.nameRo,
        })),
        companies,
        practitioners: practitioners.map((p) => ({
          id: p.id,
          label: `${p.lastName} ${p.firstName}${p.professionalTitle ? ` (${p.professionalTitle})` : ''}`,
        })),
      }}
      labels={filterLabels}
      values={{
        period: filters.period,
        from: filters.from,
        to: filters.to,
        type: filters.type,
        verdict: filters.verdict,
        companyId: filters.companyId,
        practitionerId: filters.practitionerId,
        sign: filters.sign,
        search: filters.search,
      }}
      exportHref={exportHref}
    />
  )

  if (examinations.length === 0) {
    return (
      <div className="space-y-4">
        {filterBar}
        <div className="border border-dashed rounded-lg p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {hasActiveExamFilters(filters)
              ? t('examinations.filters.noMatches')
              : t('examinations.empty')}
          </p>
          {props.canWrite && !hasActiveExamFilters(filters) && (
            <Button asChild className="mt-4">
              <Link href="/examinations/new">+ {t('examinations.newButton')}</Link>
            </Button>
          )}
        </div>
      </div>
    )
  }

  const totalPages = Math.ceil(total / LIST_PAGE_SIZE)

  return (
    <div className="space-y-4">
      {filterBar}
      <div className="border rounded-lg divide-y">
        {examinations.map((e) => (
          <Link
            key={e.id}
            href={`/examinations/${e.id}`}
            className="block px-4 py-3 hover:bg-muted transition-colors"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.examinationNumber}
                  </span>
                  <span>
                    {e.employee.lastName} {e.employee.firstName}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {e.workplace.company.name} • {formatWorkplaceLabel(e.workplace)} •{' '}
                  {props.locale === 'en'
                    ? (e.examinationType.nameEn ?? e.examinationType.nameRo)
                    : e.examinationType.nameRo}
                </div>
              </div>
              <div className="text-xs text-right">
                <ExaminationStatusBadge
                  status={e.status}
                  scheduledAt={e.scheduledAt}
                  startedAt={e.startedAt}
                  completedAt={e.completedAt}
                  signedAt={e.signedAt}
                  locale={props.locale === 'en' ? 'en' : 'ro'}
                />
                {e.scheduledAt && (
                  <div className="text-muted-foreground mt-1">
                    {formatDate(e.scheduledAt, 'medium', props.locale === 'ro' ? 'ro' : 'en')}
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
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
