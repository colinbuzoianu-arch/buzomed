import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LogoutButton } from '@/components/logout-button'
import Link from 'next/link'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  const isSuperAdmin = user.roles.includes('super_admin')
  const hasTenant = user.tenantId !== null
  const hasReportingRole = user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )

  // Overdue badge for the Recalls nav. Counted here on every authenticated
  // page render — cheap because the @@index([tenantId, dueDate, status])
  // index covers exactly this query. If this ever becomes a hot path we
  // can move it to a request-cached helper.
  let overdueCount = 0
  if (!isSuperAdmin && hasTenant) {
    overdueCount = await prisma.recall.count({
      where: {
        tenantId: user.tenantId!,
        status: 'overdue',
        deletedAt: null,
        OR: [
          { createdFromExaminationId: null },
          { createdFromExamination: { deletedAt: null } },
        ],
      },
    })
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-2xl font-bold text-primary">
              Buzomed
            </Link>

            <nav className="flex gap-4 text-sm">
              {isSuperAdmin && (
                <Link
                  href="/super-admin"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('nav.tenants')}
                </Link>
              )}
              {!isSuperAdmin && hasTenant && (
                <>
                  <Link
                    href="/companies"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('nav.companies')}
                  </Link>
                  <Link
                    href="/employees"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('nav.employees')}
                  </Link>
                  <Link
                    href="/examinations"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('nav.examinations')}
                  </Link>
                  <Link
                    href="/recalls"
                    className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
                  >
                    {t('nav.recalls')}
                    {overdueCount > 0 && (
                      <span
                        className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-medium"
                        title={t('nav.recallsOverdueTooltip').replace(
                          '{count}',
                          String(overdueCount)
                        )}
                      >
                        {overdueCount}
                      </span>
                    )}
                  </Link>
                  {hasReportingRole && (
                    <Link
                      href="/reports"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t('nav.reports')}
                    </Link>
                  )}
                  <Link
                    href="/team"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('nav.team')}
                  </Link>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user.firstName} {user.lastName}
            </span>
            <LanguageSwitcher currentLocale={locale} />
            <LogoutButton label={t('common.logout')} />
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
