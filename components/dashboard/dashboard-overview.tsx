import type { Translator } from '@/lib/i18n'
import { prisma } from '@/lib/prisma'
import { DashboardOverviewView } from './dashboard-overview-view'

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

  return <DashboardOverviewView employeeCount={employeeCount} companyCount={companyCount} t={t} />
}
