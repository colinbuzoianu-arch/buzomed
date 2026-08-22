import type { ExaminationStatus } from '@prisma/client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ExaminationStatusBadge } from '@/components/ui/examination-status-badge'
import { Pagination } from '@/components/ui/pagination'
import { formatDate } from '@/lib/format-date'
import { prisma } from '@/lib/prisma'

const EXAMINATIONS_PATH = '/examinations'
const LIST_PAGE_SIZE = 200

export default async function ExaminationsListView(props: {
  tenantId: string
  status: ExaminationStatus | null
  locale: 'ro' | 'en'
  canWrite: boolean
  t: (k: string) => string
  page: number
  total: number
  searchParams: Record<string, string | undefined>
}) {
  const examinations = await prisma.examination.findMany({
    where: {
      tenantId: props.tenantId,
      deletedAt: null,
      ...(props.status ? { status: props.status } : {}),
    },
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
        },
      },
      examinationType: { select: { nameRo: true, nameEn: true, code: true } },
    },
  })

  const t = props.t

  if (examinations.length === 0) {
    return (
      <div className="border border-dashed rounded-lg p-12 text-center">
        <p className="text-sm text-muted-foreground">{t('examinations.empty')}</p>
        {props.canWrite && (
          <Button asChild className="mt-4">
            <Link href="/examinations/new">+ {t('examinations.newButton')}</Link>
          </Button>
        )}
      </div>
    )
  }

  const totalPages = Math.ceil(props.total / LIST_PAGE_SIZE)

  return (
    <div className="space-y-4">
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
                  {e.workplace.company.name} • {e.workplace.name} •{' '}
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
