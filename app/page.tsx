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
  
  // Future: practice_admin → /dashboard, practitioner → /examinations
  // For now, just show a placeholder
  redirect('/super-admin')
}
