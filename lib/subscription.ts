import { prisma } from '@/lib/prisma'
import type { Plan, Subscription } from '@prisma/client'

export type SubscriptionWithPlan = Subscription & { plan: Plan | null }

export async function getTenantSubscription(tenantId: string): Promise<SubscriptionWithPlan | null> {
  return prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  })
}

export async function countActiveEmployees(tenantId: string): Promise<number> {
  return prisma.employee.count({
    where: { tenantId, isActive: true, archivedAt: null, deletedAt: null },
  })
}

export function calculateTier(employeeCount: number): 'starter' | 'growth' | 'pro' | 'enterprise' {
  if (employeeCount <= 100) return 'starter'
  if (employeeCount <= 500) return 'growth'
  if (employeeCount <= 2000) return 'pro'
  return 'enterprise'
}

export async function canTenantDo(
  tenantId: string,
  action: 'add_employee' | 'add_examination'
): Promise<{ allowed: boolean; reason?: string }> {
  const sub = await getTenantSubscription(tenantId)
  if (!sub) return { allowed: false, reason: 'no_subscription' }

  const { status } = sub

  if (status === 'trial_expired' || status === 'canceled' || status === 'cancelled') {
    return { allowed: false, reason: 'subscription_expired' }
  }
  if (status === 'suspended') {
    return { allowed: false, reason: 'account_suspended' }
  }

  // For add_examination, no employee limit applies
  if (action === 'add_examination') return { allowed: true }

  // Check employee cap for add_employee
  const maxEmployees = sub.plan?.maxEmployees ?? (status === 'trial_active' ? 100 : -1)
  if (maxEmployees === -1) return { allowed: true }

  const current = await countActiveEmployees(tenantId)
  if (current >= maxEmployees) {
    return { allowed: false, reason: 'employee_limit_reached' }
  }
  return { allowed: true }
}
