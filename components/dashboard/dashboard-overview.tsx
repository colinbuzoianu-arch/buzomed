import Link from 'next/link'
import type { Translator } from '@/lib/i18n'
import { prisma } from '@/lib/prisma'

export default async function DashboardOverview({
  tenantId,
  t,
}: {
  tenantId: string
  t: Translator
}) {
  const [employeeCount, companyCount] = await Promise.all([
    // Total active employees in the cabinet
    prisma.employee.count({
      where: {
        tenantId,
        archivedAt: null,
        deletedAt: null,
      },
    }),

    // Total active companies
    prisma.company.count({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
      },
    }),
  ])

  return (
    <section className="border-t pt-6">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-sm">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-medium tabular-nums text-foreground">{companyCount}</span>
          <span className="text-[hsl(var(--text-muted))]">{t('dashboard.companies')}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-medium tabular-nums text-foreground">{employeeCount}</span>
          <span className="text-[hsl(var(--text-muted))]">{t('dashboard.employees')}</span>
        </div>
        <Link href="/reports" className="ml-auto text-sm text-primary hover:underline">
          {t('dashboard.viewFullReport')} →
        </Link>
      </div>
    </section>
  )
}
