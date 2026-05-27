import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { RecallStatusBadge } from '@/components/ui/recall-status-badge'
import { formatDate } from '@/lib/format-date'

interface PageProps {
  searchParams: Promise<{ horizon?: string }>
}

const HORIZONS = ['overdue', '30', '60', '90', '180'] as const
type Horizon = (typeof HORIZONS)[number]

function parseHorizon(raw: string | undefined): Horizon {
  return HORIZONS.includes(raw as Horizon) ? (raw as Horizon) : '90'
}

export default async function ExpirationPage({ searchParams }: PageProps) {
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
  const horizon = parseHorizon(sp.horizon)

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const cutoff = new Date(today)
  if (horizon !== 'overdue') {
    cutoff.setDate(cutoff.getDate() + Number(horizon))
  }

  const exams = await prisma.examination.findMany({
    where: {
      tenantId: user.tenantId,
      deletedAt: null,
      status: { notIn: ['cancelled', 'no_show'] },
      nextExaminationDueDate: {
        not: null,
        ...(horizon === 'overdue' ? { lt: today } : { lt: cutoff }),
      },
      employee: { deletedAt: null },
    },
    orderBy: { nextExaminationDueDate: 'asc' },
    select: {
      id: true,
      examinationNumber: true,
      createdAt: true,
      nextExaminationDueDate: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
      workplace: {
        select: {
          id: true,
          name: true,
          department: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  })

  // Keep only the most recent exam per employee
  const byEmployee = new Map<string, (typeof exams)[number]>()
  for (const e of exams) {
    const existing = byEmployee.get(e.employee.id)
    if (!existing || e.createdAt > existing.createdAt) {
      byEmployee.set(e.employee.id, e)
    }
  }

  const rows = Array.from(byEmployee.values()).sort((a, b) => {
    const da = a.nextExaminationDueDate!.getTime()
    const db = b.nextExaminationDueDate!.getTime()
    return da - db
  })

  const fromParam = today.toISOString().slice(0, 10)
  const toParam = cutoff.toISOString().slice(0, 10)
  const csvUrl = `/api/reports/expiration?horizon=${horizon}&from=${fromParam}&to=${toParam}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">{t('reports.expiration.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('reports.expiration.subtitle')}</p>
      </div>

      {/* Horizon selector */}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="text-muted-foreground self-center mr-1">
          {t('reports.expiration.horizon.label')}:
        </span>
        {HORIZONS.map((h) => (
          <Link
            key={h}
            href={`/reports/expiration?horizon=${h}`}
            className={`px-3 py-1 rounded-md border transition-colors ${
              horizon === h ? 'bg-secondary font-medium' : 'hover:bg-muted'
            }`}
          >
            {t(`reports.expiration.horizon.${h}`)}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('reports.expiration.empty')}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? 'angajat' : 'angajati'}
            </span>
            <a
              href={csvUrl}
              className="text-sm border rounded-md px-3 py-1 hover:bg-muted print:hidden"
            >
              {t('reports.expiration.exportCsv')}
            </a>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">{t('reports.expiration.colWorker')}</th>
                  <th className="text-left px-4 py-2">{t('reports.expiration.colCompany')}</th>
                  <th className="text-left px-4 py-2">{t('reports.expiration.colWorkplace')}</th>
                  <th className="text-left px-4 py-2">{t('reports.expiration.colDue')}</th>
                  <th className="text-right px-4 py-2">{t('reports.expiration.colDaysLeft')}</th>
                  <th className="text-left px-4 py-2">{t('reports.expiration.colLastExam')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => {
                  const due = row.nextExaminationDueDate!
                  const daysLeft = Math.ceil(
                    (due.getTime() - today.getTime()) / 86_400_000
                  )
                  const isOverdue = daysLeft < 0
                  return (
                    <tr key={row.employee.id}>
                      <td className="px-4 py-2 font-medium whitespace-nowrap">
                        <Link
                          href={`/employees/${row.employee.id}`}
                          className="hover:underline"
                        >
                          {row.employee.lastName} {row.employee.firstName}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/companies/${row.workplace.company.id}`}
                          className="hover:underline text-muted-foreground"
                        >
                          {row.workplace.company.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {row.workplace.name}
                        {row.workplace.department && (
                          <span className="text-xs"> — {row.workplace.department}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                          {formatDate(due, 'medium', locale === 'ro' ? 'ro' : 'en')}
                        </span>
                        {isOverdue && (
                          <span className="ml-2">
                            <RecallStatusBadge status="overdue" />
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums font-semibold whitespace-nowrap ${
                          isOverdue ? 'text-destructive' : daysLeft <= 14 ? 'text-amber-600' : ''
                        }`}
                      >
                        {isOverdue ? `+${Math.abs(daysLeft)}` : daysLeft}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        <Link
                          href={`/examinations/${row.id}`}
                          className="hover:underline"
                        >
                          {row.examinationNumber}
                        </Link>
                        <span className="ml-1">
                          ({formatDate(row.createdAt, 'medium', locale === 'ro' ? 'ro' : 'en')})
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {rows.map((row) => {
              const due = row.nextExaminationDueDate!
              const daysLeft = Math.ceil(
                (due.getTime() - today.getTime()) / 86_400_000
              )
              const isOverdue = daysLeft < 0
              return (
                <div
                  key={row.employee.id}
                  className={`border rounded-lg p-3 space-y-2 ${isOverdue ? 'border-destructive/40 bg-destructive/5' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/employees/${row.employee.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.employee.lastName} {row.employee.firstName}
                    </Link>
                    <span
                      className={`text-sm font-semibold whitespace-nowrap tabular-nums ${
                        isOverdue
                          ? 'text-destructive'
                          : daysLeft <= 14
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {isOverdue ? `+${Math.abs(daysLeft)}` : daysLeft}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>
                      <Link
                        href={`/companies/${row.workplace.company.id}`}
                        className="hover:underline"
                      >
                        {row.workplace.company.name}
                      </Link>
                      {' · '}
                      {row.workplace.name}
                      {row.workplace.department && ` — ${row.workplace.department}`}
                    </div>
                    <div className={isOverdue ? 'text-destructive font-medium' : ''}>
                      {formatDate(due, 'medium', locale === 'ro' ? 'ro' : 'en')}
                      {isOverdue && (
                        <span className="ml-2 inline-flex">
                          <RecallStatusBadge status="overdue" />
                        </span>
                      )}
                    </div>
                    <div>
                      <Link
                        href={`/examinations/${row.id}`}
                        className="hover:underline"
                      >
                        {row.examinationNumber}
                      </Link>
                      {' '}
                      ({formatDate(row.createdAt, 'medium', locale === 'ro' ? 'ro' : 'en')})
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
