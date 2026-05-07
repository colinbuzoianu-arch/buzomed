import { createClient } from './supabase/server'
import { prisma } from './prisma'
import { redirect } from 'next/navigation'
import type { User as AppUser } from '@prisma/client'

/**
 * Returns the currently logged-in app User, or null if not authenticated.
 * Combines Supabase Auth identity with our application's User table row.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  // Look up the app-side user record linked to this auth identity
  const appUser = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
  })

  return appUser
}

/**
 * Server-side guard: throws redirect to /login if not authenticated.
 * Use in server components and API routes.
 */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

/**
 * Server-side guard: requires user with at least one of the given roles.
 */
export async function requireRole(
  ...allowedRoles: Array<'super_admin' | 'practice_admin' | 'practitioner' | 'assistant'>
): Promise<AppUser> {
  const user = await requireUser()
  const hasRole = user.roles.some((r) => allowedRoles.includes(r as typeof allowedRoles[number]))
  if (!hasRole) redirect('/')
  return user
}
