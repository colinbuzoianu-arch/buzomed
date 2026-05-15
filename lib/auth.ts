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

  if (!appUser) return null

  // Update lastLoginAt lazily — at most once per 5 minutes to avoid
  // hammering the DB on every page navigation. We check the existing
  // value first so most requests skip the UPDATE entirely.
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  if (!appUser.lastLoginAt || appUser.lastLoginAt < fiveMinutesAgo) {
    // Fire and forget — don't await so it doesn't add latency to the
    // page render. If it fails, the stale value is harmless.
    prisma.user.update({
      where: { id: appUser.id },
      data: { lastLoginAt: new Date() },
    }).catch((err) => {
      console.warn('[auth] lastLoginAt update failed:', err)
    })
  }

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

/**
 * API-route variant of getCurrentUser.
 *
 * Returns a tagged result instead of `User | null`, so API routes can
 * distinguish "no session" from "session exists but no DB user" and
 * return appropriate HTTP status codes.
 *
 * The latter case happens for users who:
 * - Authenticated with Supabase but haven't accepted their invite yet
 * - Had their DB row deleted while their Supabase session was still valid
 * - Were soft-deleted (deletedAt set) or deactivated (isActive = false)
 *
 * Use this in `app/api/...` routes. Use `requireUser()` in server
 * components / pages where redirecting on auth failure is appropriate.
 */
export type ApiAuthResult =
  | { user: AppUser; supabaseUserId: string }
  | { user: null; reason: 'no_session' | 'no_db_user' | 'inactive' }

export async function getApiUser(): Promise<ApiAuthResult> {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return { user: null, reason: 'no_session' }
  }

  const appUser = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
  })

  if (!appUser) {
    return { user: null, reason: 'no_db_user' }
  }

  if (appUser.deletedAt || !appUser.isActive) {
    return { user: null, reason: 'inactive' }
  }

  return { user: appUser, supabaseUserId: authUser.id }
}
