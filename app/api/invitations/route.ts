import { NextRequest, NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { createInvitation } from '@/lib/invitations/service'
import type { Locale } from '@/lib/email'

const VALID_ROLES: UserRole[] = [
  'super_admin',
  'practice_admin',
  'practitioner',
  'assistant',
]

/**
 * POST /api/invitations
 *
 * Body:
 * {
 *   "email": "person@example.com",
 *   "role": "practitioner",
 *   "tenantId": "uuid",
 *   "recipientName": "Optional Name",
 *   "locale": "ro" | "en"  (optional, defaults to "ro")
 * }
 *
 * Permission checks happen in the service layer via canInvite().
 */
export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_json' },
      { status: 400 }
    )
  }

  const parsed = parseCreateBody(body)
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.issues },
      { status: 400 }
    )
  }

  const appUrl = getAppUrl(request)
  const result = await createInvitation({
    actor: {
      userId: auth.user.id,
      tenantId: auth.user.tenantId,
      roles: auth.user.roles,
      fullName: `${auth.user.firstName} ${auth.user.lastName}`,
      locale: parsed.locale,
    },
    email: parsed.email,
    role: parsed.role,
    tenantId: parsed.tenantId,
    recipientName: parsed.recipientName,
    appUrl,
  })

  if (!result.ok) {
    const status =
      result.error === 'forbidden'
        ? 403
        : result.error === 'tenant_not_found'
          ? 404
          : result.error === 'database_error'
            ? 500
            : result.error === 'user_already_active'
              ? 409
              : 400
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status }
    )
  }

  return NextResponse.json(
    {
      ok: true,
      invitation: {
        id: result.invitation.id,
        email: result.invitation.email,
        role: result.invitation.role,
        tenantId: result.invitation.tenantId,
        expiresAt: result.invitation.expiresAt,
        createdAt: result.invitation.createdAt,
      },
      emailSent: result.emailSent,
    },
    { status: 201 }
  )
}

/**
 * GET /api/invitations
 *
 * Returns invitations scoped to the caller's role:
 * - super_admin: all invitations across all tenants
 * - practice_admin / practitioner / assistant: only their own tenant
 *
 * Query params:
 *   ?tenantId=...  filter to a specific tenant (super_admin only;
 *                  others are auto-filtered to their tenant)
 *   ?status=pending|accepted|revoked|expired  default 'pending'
 */
export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const requestedTenantId = searchParams.get('tenantId')
  const status = searchParams.get('status') ?? 'pending'

  const isSuperAdmin = auth.user.roles.includes('super_admin')

  // Build the tenant scope filter
  let tenantIdFilter: string | undefined
  if (isSuperAdmin) {
    tenantIdFilter = requestedTenantId ?? undefined
  } else {
    if (!auth.user.tenantId) {
      return NextResponse.json({ invitations: [] })
    }
    if (requestedTenantId && requestedTenantId !== auth.user.tenantId) {
      return NextResponse.json(
        { error: 'forbidden', message: 'Cannot view other tenants' },
        { status: 403 }
      )
    }
    tenantIdFilter = auth.user.tenantId
  }

  const now = new Date()
  type StatusFilter = {
    acceptedAt?: { not: null } | null
    revokedAt?: { not: null } | null
    expiresAt?: { gt: Date } | { lte: Date }
  }
  let statusFilter: StatusFilter
  switch (status) {
    case 'accepted':
      statusFilter = { acceptedAt: { not: null } }
      break
    case 'revoked':
      statusFilter = { revokedAt: { not: null } }
      break
    case 'expired':
      statusFilter = {
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { lte: now },
      }
      break
    case 'pending':
    default:
      statusFilter = {
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      }
      break
  }

  const invitations = await prisma.invitation.findMany({
    where: {
      ...(tenantIdFilter ? { tenantId: tenantIdFilter } : {}),
      ...statusFilter,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      tenant: { select: { id: true, name: true } },
      invitedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    take: 100,
  })

  return NextResponse.json({
    invitations: invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      tenantId: inv.tenantId,
      tenantName: inv.tenant.name,
      invitedBy: {
        id: inv.invitedBy.id,
        name: `${inv.invitedBy.firstName} ${inv.invitedBy.lastName}`,
        email: inv.invitedBy.email,
      },
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      acceptedAt: inv.acceptedAt,
      revokedAt: inv.revokedAt,
    })),
  })
}

// ============================================================================
// Helpers
// ============================================================================

interface ParsedCreateBody {
  ok: true
  email: string
  role: UserRole
  tenantId: string
  recipientName?: string
  locale: Locale
}
interface InvalidCreateBody {
  ok: false
  issues: string[]
}

function parseCreateBody(body: unknown): ParsedCreateBody | InvalidCreateBody {
  const issues: string[] = []
  if (typeof body !== 'object' || body === null) {
    return { ok: false, issues: ['body must be a JSON object'] }
  }
  const b = body as Record<string, unknown>

  if (typeof b.email !== 'string' || b.email.trim() === '') {
    issues.push('email is required and must be a non-empty string')
  }
  if (typeof b.tenantId !== 'string' || b.tenantId.trim() === '') {
    issues.push('tenantId is required and must be a non-empty string')
  }
  if (typeof b.role !== 'string' || !VALID_ROLES.includes(b.role as UserRole)) {
    issues.push(`role must be one of: ${VALID_ROLES.join(', ')}`)
  }
  if (
    b.recipientName !== undefined &&
    (typeof b.recipientName !== 'string' || b.recipientName.length > 200)
  ) {
    issues.push('recipientName must be a string under 200 chars')
  }
  const locale = typeof b.locale === 'string' ? b.locale : 'ro'
  if (locale !== 'ro' && locale !== 'en') {
    issues.push("locale must be 'ro' or 'en'")
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    email: (b.email as string).trim(),
    role: b.role as UserRole,
    tenantId: (b.tenantId as string).trim(),
    recipientName:
      typeof b.recipientName === 'string' ? b.recipientName.trim() : undefined,
    locale: locale as Locale,
  }
}

/**
 * Determine the public-facing app URL for building accept links.
 * Uses NEXT_PUBLIC_APP_URL if set, otherwise reconstructs from the
 * request headers.
 */
function getAppUrl(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL
  if (fromEnv) return fromEnv

  // Fallback: derive from request
  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  const host = request.headers.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}
