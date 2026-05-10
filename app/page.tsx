import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function RootPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  // Route based on role
  if (user.roles.includes('super_admin')) {
    redirect('/super-admin')
  }

  // Tenant users (practice_admin, practitioner, assistant) land on team page
  // for now. Future: dedicated dashboards by role.
  if (user.tenantId) {
    redirect('/team')
  }

  // No tenant and not super_admin — anomalous state. Send to login.
  // (Could happen if a user's tenant was deleted while they were signed in.)
  redirect('/login')
}