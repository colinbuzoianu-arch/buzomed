import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import type { ExaminationStatus } from '@prisma/client'

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

const VALID_STATUSES: ExaminationStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
]

export default async function ExaminationsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const params = await searchParams
  const filterStatus = params.status as ExaminationStatus | undefined
  const validStatus =
    filterStatus && VALID_STATUSES.includes(filterStatus) ? filterStatus : null

  const examinations = await prisma.examination.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
      ...(validStatus ? { status: validStatus } : {}),
    },
    orderBy: [
      { scheduledAt: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 200,
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true },
      },
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

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  // Quick counts for the tab indicators.
  const counts = await prisma.examination.groupBy({
    by: ['status'],
    where: { tenantId: user.tenantId, deletedAt: null },
    _count: true,
  })
  const countByStatus = (s: ExaminationStatus): number =>
    counts.find((c) => c.status === s)?._count ?? 0

  const tabs: { status: ExaminationStatus | null; label: string; count: number }[] =
    [
      {
        status: null,
        label: t('examinations.tabs.all'),
        count: counts.reduce((s, c) => s + c._count, 0),
      },
      {
        status: 'scheduled',
        label: t('examinations.tabs.scheduled'),
        count: countByStatus('scheduled'),
      },
      {
        status: 'in_progress',
        label: t('examinations.tabs.in_progress'),
        count: countByStatus('in_progress'),
      },
      {
        status: 'completed',
        label: t('examinations.tabs.completed'),
        count: countByStatus('completed'),
      },
    ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('examinations.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('examinations.subtitle')}
          </p>
        </div>
        {caps.canWrite && (
          <Button asChild>
            <Link href="/examinations/new">+ {t('examinations.newButton')}</Link>
          </Button>
        )}
      </div>

      <div className="flex gap-2 text-sm flex-wrap">
        {tabs.map((tab) => {
          const href = tab.status
            ? `/examinations?status=${tab.status}`
            : '/examinations'
          const active = validStatus === tab.status
          return (
            <Link
              key={tab.label}
              href={href}
              className={`px-3 py-1 rounded-md border ${
                active ? 'bg-secondary' : 'hover:bg-muted'
              }`}
            >
              {tab.label}{' '}
              <span className="text-muted-foreground">({tab.count})</span>
            </Link>
          )
        })}
      </div>

      {examinations.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {t('examinations.empty')}
          </p>
          {caps.canWrite && (
            <Button asChild className="mt-4">
              <Link href="/examinations/new">+ {t('examinations.newButton')}</Link>
            </Button>
          )}
        </div>
      ) : (
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
                    {locale === 'en'
                      ? e.examinationType.nameEn ?? e.examinationType.nameRo
                      : e.examinationType.nameRo}
                  </div>
                </div>
                <div className="text-xs text-right">
                  <StatusBadge status={e.status} t={t} />
                  {e.scheduledAt && (
                    <div className="text-muted-foreground mt-1">
                      {dateFormatter.format(e.scheduledAt)}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({
  status,
  t,
}: {
  status: ExaminationStatus
  t: (k: string) => string
}) {
  const colors: Record<ExaminationStatus, string> = {
    scheduled: 'text-blue-700 bg-blue-50 border-blue-200',
    in_progress: 'text-amber-700 bg-amber-50 border-amber-200',
    completed: 'text-green-700 bg-green-50 border-green-200',
    cancelled: 'text-muted-foreground bg-muted border-muted',
    no_show: 'text-muted-foreground bg-muted border-muted',
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs border ${colors[status]}`}
    >
      {t(`examinations.status.${status}`)}
    </span>
  )
}
