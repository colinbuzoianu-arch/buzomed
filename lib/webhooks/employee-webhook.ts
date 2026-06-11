import { prisma } from '@/lib/prisma'
import { deliverWebhook } from './deliver'

/**
 * Fetches the public-safe employee payload and delivers an employee.updated
 * webhook. Called fire-and-forget (void) so callers are never slowed down.
 */
export async function deliverEmployeeUpdatedWebhook(
  employeeId: string,
  tenantId: string
): Promise<void> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId, deletedAt: null },
    select: {
      id: true,
      companyEmployeeId: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      email: true,
      phone: true,
      companyId: true,
      isActive: true,
      updatedAt: true,
      company: { select: { name: true } },
      workplaceAssignments: {
        where: { isCurrent: true },
        take: 1,
        select: { workplaceId: true, workplace: { select: { name: true } } },
      },
    },
  })
  if (!employee) return

  await deliverWebhook(tenantId, 'employee.updated', {
    id: employee.id,
    companyEmployeeId: employee.companyEmployeeId,
    firstName: employee.firstName,
    lastName: employee.lastName,
    jobTitle: employee.jobTitle,
    email: employee.email,
    phone: employee.phone,
    companyId: employee.companyId,
    companyName: employee.company?.name ?? null,
    workplaceId: employee.workplaceAssignments[0]?.workplaceId ?? null,
    workplaceName: employee.workplaceAssignments[0]?.workplace?.name ?? null,
    isActive: employee.isActive,
    updatedAt: employee.updatedAt,
  })
}
