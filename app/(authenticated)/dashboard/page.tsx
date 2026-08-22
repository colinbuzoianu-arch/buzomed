import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format-date'
import { DashboardGreeting } from '@/components/dashboard-greeting'
import DashboardAlerts from '@/components/dashboard/dashboard-alerts'
import { DashboardAlertsSkeleton } from '@/components/dashboard/dashboard-alerts-skeleton'
import DashboardStats from '@/components/dashboard/dashboard-stats'
import { DashboardStatsSkeleton } from '@/components/dashboard/dashboard-stats-skeleton'
import DashboardOverview from '@/components/dashboard/dashboard-overview'
import { DashboardOverviewSkeleton } from '@/components/dashboard/dashboard-overview-skeleton'

/**
 * Dashboard — the first thing a cabinet user sees after logging in.
 *
 * Three sections:
 *   1. Greeting — good morning/afternoon/evening + cabinet name
 *   2. Action cards — overdue recalls (red if > 0), today's exams,
 *      in-progress exams, and unsigned completed exams
 *   3. Quick actions — shortcuts to the most common tasks
 *
 * The most-visited page; it must be fast. The shell (auth, greeting,
 * quick actions) renders as soon as the cheap tenant-name lookup
 * resolves — the heavier count queries live in their own Suspense-
 * wrapped Server Components (dashboard-alerts, dashboard-stats,
 * dashboard-overview) so each streams in independently instead of
 * blocking the whole page on the slowest one.
 */

export default async function DashboardPage() {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/login')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/login')

  const tenantId = user.tenantId

  // Cabinet name for the greeting — kept in the shell (not suspended)
  // since it's a single indexed PK lookup, fast enough not to delay
  // first paint.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  })

  const firstName = user.firstName
  const cabinetName = tenant?.name ?? ''

  return (
    <div className="space-y-8">
      {/* Greeting — rendered client-side so getHours() uses the browser's local timezone */}
      <DashboardGreeting
        firstName={firstName}
        cabinetName={cabinetName}
        formattedDate={formatDate(new Date(), 'long', locale === 'en' ? 'en' : 'ro')}
        morning={t('dashboard.goodMorning')}
        afternoon={t('dashboard.goodAfternoon')}
        evening={t('dashboard.goodEvening')}
      />

      {/* Urgent items — the "what needs attention NOW" row */}
      <Suspense fallback={<DashboardAlertsSkeleton />}>
        <DashboardAlerts tenantId={tenantId} t={t} />
      </Suspense>

      {/* Today section */}
      <Suspense fallback={<DashboardStatsSkeleton />}>
        <DashboardStats tenantId={tenantId} t={t} />
      </Suspense>

      {/* Quick actions */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--text-muted))]">
          {t('dashboard.quickActions')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {caps.canWriteAdministrative && (
            <>
              <Button asChild>
                <Link href="/examinations/new">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  <span>{t('examinations.newButton')}</span>
                  <kbd className="ml-1 hidden sm:inline-flex items-center rounded border border-white/20 bg-white/10 px-1 py-0 text-[10px] font-mono text-white/80 leading-4">
                    N
                  </kbd>
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/employees/new">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  <span>{t('employees.newButton')}</span>
                </Link>
              </Button>
              {caps.canWrite && (
                <Button asChild variant="outline">
                  <Link href="/companies/new">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                    </svg>
                    <span>{t('companies.newButton')}</span>
                  </Link>
                </Button>
              )}
            </>
          )}
          <Button asChild variant="outline">
            <Link href="/examinations?tab=scadente">
              {t('dashboard.viewScadente')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/reports">
              {t('nav.reports')}
            </Link>
          </Button>
        </div>
      </section>

      {/* Cabinet overview */}
      <Suspense fallback={<DashboardOverviewSkeleton />}>
        <DashboardOverview tenantId={tenantId} t={t} />
      </Suspense>
    </div>
  )
}
