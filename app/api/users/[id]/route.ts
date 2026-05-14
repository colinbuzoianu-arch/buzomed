import { NextRequest, NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canManageUser,
  validateRoleAssignment,
  ASSIGNABLE_ROLES,
} from '@/lib/permissions/user-admin'
import { checkLastAdminGuard } from '@/lib/permissions/last-admin'
import { asObject, optionalString } from '@/lib/validation'

/**
 * User management API.
 *
 *   GET    — return a single user's details (for the edit dialog)
 *   PATCH  — update roles + isActive
 *   DELETE — archive (soft-delete; sets deletedAt). Hard-delete is never
 *            offered through this API — historical audit trail (signed
 *            fișas reference the practitioner by name) requires the row
 *            to persist.
 *
 * All routes enforce canManageUser + last-admin guard for any operation
 * that would reduce admin coverage.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }

  const { id } = await ctx.params
  const target = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      professionalTitle: true,
      roles: true,
      isActive: true,
      tenantId: true,
      createdAt: true,
    },
  })

  if (!target) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const check = canManageUser(
    { id: auth.user.id, roles: auth.user.roles, tenantId: auth.user.tenantId },
    { id: target.id, roles: target.roles, tenantId: target.tenantId }
  )
  if (!check.allowed) {
    return NextResponse.json(
      { error: 'forbidden', reason: check.reason },
      { status: 403 }
    )
  }

  return NextResponse.json({ user: target })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }

  const { id } = await ctx.params
  const target = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, roles: true, tenantId: true, isActive: true },
  })
  if (!target) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const check = canManageUser(
    { id: auth.user.id, roles: auth.user.roles, tenantId: auth.user.tenantId },
    { id: target.id, roles: target.roles, tenantId: target.tenantId }
  )
  if (!check.allowed) {
    return NextResponse.json(
      { error: 'forbidden', reason: check.reason },
      { status: 403 }
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const body = asObject(raw) ?? {}

  // Validate the role array if provided.
  const issues: string[] = []
  let newRoles: UserRole[] | null = null
  if (body.roles !== undefined) {
    if (!Array.isArray(body.roles)) {
      issues.push('roles must be an array of role strings')
    } else {
      const requested = body.roles.filter((r): r is string => typeof r === 'string')
      const validation = validateRoleAssignment(requested as UserRole[])
      if (!validation.ok) {
        issues.push(`Invalid roles: ${validation.reason}`)
      } else {
        newRoles = requested as UserRole[]
      }
    }
  }

  let newIsActive: boolean | null = null
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      issues.push('isActive must be a boolean')
    } else {
      newIsActive = body.isActive
    }
  }

  const newProfessionalTitle = optionalString(
    'professionalTitle',
    body.professionalTitle,
    issues,
    { maxLength: 100 }
  )

  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  if (newRoles === null && newIsActive === null && newProfessionalTitle === undefined) {
    return NextResponse.json(
      { error: 'no_changes' },
      { status: 400 }
    )
  }

  // Last-admin guards.
  if (target.tenantId) {
    const isDemotion =
      newRoles !== null &&
      target.roles.includes('practice_admin') &&
      !newRoles.includes('practice_admin')
    if (isDemotion) {
      const guard = await checkLastAdminGuard(prisma, {
        tenantId: target.tenantId,
        targetUserId: target.id,
        targetCurrentRoles: target.roles,
        action: 'demote',
      })
      if (!guard.ok) {
        return NextResponse.json(
          { error: 'last_admin_protected', reason: guard.reason },
          { status: 409 }
        )
      }
    }

    const isDeactivation =
      newIsActive === false && target.isActive === true
    if (isDeactivation) {
      const guard = await checkLastAdminGuard(prisma, {
        tenantId: target.tenantId,
        targetUserId: target.id,
        targetCurrentRoles: target.roles,
        action: 'deactivate',
      })
      if (!guard.ok) {
        return NextResponse.json(
          { error: 'last_admin_protected', reason: guard.reason },
          { status: 409 }
        )
      }
    }
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(newRoles !== null ? { roles: newRoles } : {}),
      ...(newIsActive !== null ? { isActive: newIsActive } : {}),
      ...(newProfessionalTitle !== undefined
        ? { professionalTitle: newProfessionalTitle }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      roles: true,
      isActive: true,
      professionalTitle: true,
    },
  })

  return NextResponse.json({ user: updated, assignableRoles: ASSIGNABLE_ROLES })
}

/**
 * DELETE = archive (soft-delete). Sets deletedAt; never removes the row.
 * Historical references (signed fișas with practitioner name, audit logs,
 * exam authorship) remain valid.
 */
export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }

  const { id } = await ctx.params
  const target = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, roles: true, tenantId: true, isActive: true },
  })
  if (!target) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const check = canManageUser(
    { id: auth.user.id, roles: auth.user.roles, tenantId: auth.user.tenantId },
    { id: target.id, roles: target.roles, tenantId: target.tenantId }
  )
  if (!check.allowed) {
    return NextResponse.json(
      { error: 'forbidden', reason: check.reason },
      { status: 403 }
    )
  }

  if (target.tenantId) {
    const guard = await checkLastAdminGuard(prisma, {
      tenantId: target.tenantId,
      targetUserId: target.id,
      targetCurrentRoles: target.roles,
      action: 'archive',
    })
    if (!guard.ok) {
      return NextResponse.json(
        { error: 'last_admin_protected', reason: guard.reason },
        { status: 409 }
      )
    }
  }

  // Soft delete + deactivate. Active stays meaningful for reactivation.
  await prisma.user.update({
    where: { id: target.id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  })

  return NextResponse.json({ ok: true })
}
