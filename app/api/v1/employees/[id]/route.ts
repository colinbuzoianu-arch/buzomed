import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUserFromKey } from '@/lib/api-keys/auth'
import { checkApiRateLimit } from '@/lib/api-keys/rate-limit'
import { deliverWebhook } from '@/lib/webhooks/deliver'
import { logSystemError } from '@/lib/system-log/error-log'

// Fields that are never writable through the public API — clinical data,
// system fields, and PII that requires elevated internal permissions.
const FORBIDDEN_FIELDS = new Set([
  'cnp', 'cnpEncrypted', 'cnpHash', 'idDocumentType', 'idDocumentNumber',
  'birthDate', 'dateOfBirth', 'gender', 'nationality',
  'addressLine1', 'addressLine2', 'city', 'county', 'postalCode',
  'bloodType', 'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelationship',
  'notes', 'vitalSigns', 'diagnoses', 'anamnesis',
  'archivedAt', 'archivedReason', 'archive', 'unarchive', 'dataRetentionYears',
  'companyId', 'tenantId', 'deletedAt', 'createdAt', 'updatedAt',
])

async function buildEmployeeResponse(id: string, tenantId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id, tenantId, deletedAt: null },
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
      createdAt: true,
      updatedAt: true,
      company: { select: { name: true } },
      workplaceAssignments: {
        where: { isCurrent: true },
        take: 1,
        select: { workplaceId: true, workplace: { select: { name: true } } },
      },
    },
  })
  if (!employee) return null
  return {
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
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiAuth = await getApiUserFromKey(request)
  if (!apiAuth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rl = checkApiRateLimit(apiAuth.keyId)
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })

  if (!apiAuth.scopes.includes('employees:read'))
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })

  const { tenantId } = apiAuth
  const rlHeaders = { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining) }
  const { id } = await params

  const employee = await buildEmployeeResponse(id, tenantId)
  if (!employee) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: rlHeaders })

  return NextResponse.json(employee, { headers: rlHeaders })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiAuth = await getApiUserFromKey(request)
  if (!apiAuth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rl = checkApiRateLimit(apiAuth.keyId)
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 })

  if (!apiAuth.scopes.includes('employees:write'))
    return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })

  const { tenantId } = apiAuth
  const rlHeaders = { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining) }
  const { id } = await params

  // Parse body
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: rlHeaders })
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Body must be a JSON object' },
      { status: 400, headers: rlHeaders }
    )
  }
  const body = raw as Record<string, unknown>

  // Reject clinical/system fields immediately — any presence is an error,
  // not just a type mismatch, so callers know exactly what is off-limits.
  const forbiddenPresent = Object.keys(body).filter((k) => FORBIDDEN_FIELDS.has(k))
  if (forbiddenPresent.length > 0) {
    return NextResponse.json(
      { error: 'forbidden_field', fields: forbiddenPresent },
      { status: 400, headers: rlHeaders }
    )
  }

  // Type validation for allowed fields
  const issues: string[] = []
  if ('companyEmployeeId' in body && typeof body.companyEmployeeId !== 'string' && body.companyEmployeeId !== null)
    issues.push('companyEmployeeId must be a string or null')
  if ('firstName' in body && (typeof body.firstName !== 'string' || (body.firstName as string).trim().length === 0))
    issues.push('firstName must be a non-empty string')
  if ('lastName' in body && (typeof body.lastName !== 'string' || (body.lastName as string).trim().length === 0))
    issues.push('lastName must be a non-empty string')
  if ('jobTitle' in body && typeof body.jobTitle !== 'string' && body.jobTitle !== null)
    issues.push('jobTitle must be a string or null')
  if ('email' in body && typeof body.email !== 'string' && body.email !== null)
    issues.push('email must be a string or null')
  if ('phone' in body && typeof body.phone !== 'string' && body.phone !== null)
    issues.push('phone must be a string or null')
  if ('isActive' in body && typeof body.isActive !== 'boolean')
    issues.push('isActive must be a boolean')
  if ('workplaceId' in body && typeof body.workplaceId !== 'string' && body.workplaceId !== null)
    issues.push('workplaceId must be a string or null')
  if ('expectedUpdatedAt' in body && typeof body.expectedUpdatedAt !== 'string')
    issues.push('expectedUpdatedAt must be an ISO date-time string')

  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400, headers: rlHeaders })
  }

  // Parse expectedUpdatedAt up front — used inside the transaction
  const expectedDate = 'expectedUpdatedAt' in body && body.expectedUpdatedAt
    ? new Date(body.expectedUpdatedAt as string)
    : undefined

  // Load employee — need companyId for workplace tenant+company check
  try {
  const existing = await prisma.employee.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: { companyId: true, updatedAt: true },
  })
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: rlHeaders })

  // Workplace validation
  const workplaceInBody = 'workplaceId' in body
  const newWorkplaceId = workplaceInBody ? (body.workplaceId as string | null) : undefined
  let resolvedWorkplace: { id: string; name: string } | null = null

  if (workplaceInBody && newWorkplaceId !== null) {
    // Workplace must belong to the same tenant AND the same company as this
    // employee — prevents cross-company assignments.
    if (!existing.companyId) {
      return NextResponse.json({ error: 'workplace_not_found' }, { status: 404, headers: rlHeaders })
    }
    const wp = await prisma.workplace.findFirst({
      where: { id: newWorkplaceId!, tenantId, companyId: existing.companyId, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!wp) return NextResponse.json({ error: 'workplace_not_found' }, { status: 404, headers: rlHeaders })
    resolvedWorkplace = wp
  }

  // Build scalar update
  const updateData: Record<string, unknown> = {}
  if ('companyEmployeeId' in body) updateData.companyEmployeeId = body.companyEmployeeId as string | null
  if ('firstName' in body) updateData.firstName = (body.firstName as string).trim()
  if ('lastName' in body) updateData.lastName = (body.lastName as string).trim()
  if ('jobTitle' in body) updateData.jobTitle = body.jobTitle as string | null
  if ('email' in body) updateData.email = body.email as string | null
  if ('phone' in body) updateData.phone = body.phone as string | null
  if ('isActive' in body) updateData.isActive = body.isActive as boolean

  if (Object.keys(updateData).length > 0 || workplaceInBody) {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    // Atomically enforce optimistic concurrency: include updatedAt in WHERE
    // so two requests with the same expectedUpdatedAt can't both succeed.
    // The @updatedAt directive means Prisma auto-sets updated_at even when
    // data:{} is empty, making this safe as a concurrency-check-only call.
    let conflicted = false

    await prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0 || expectedDate) {
        const result = await tx.employee.updateMany({
          where: {
            id,
            tenantId,
            deletedAt: null,
            ...(expectedDate ? { updatedAt: expectedDate } : {}),
          },
          data: updateData,
        })
        if (result.count === 0 && expectedDate) {
          conflicted = true
          return
        }
      }
      if (workplaceInBody) {
        // End all current assignments
        await tx.employeeWorkplaceAssignment.updateMany({
          where: { employeeId: id, tenantId, isCurrent: true },
          data: { isCurrent: false, endDate: today },
        })
        if (resolvedWorkplace) {
          await tx.employeeWorkplaceAssignment.create({
            data: {
              tenantId,
              employeeId: id,
              workplaceId: resolvedWorkplace.id,
              startDate: today,
              isCurrent: true,
              reasonForChange: 'other',
            },
          })
        }
      }
    })

    if (conflicted) {
      const current = await buildEmployeeResponse(id, tenantId)
      return NextResponse.json({ error: 'conflict', employee: current }, { status: 409, headers: rlHeaders })
    }
  }

  const updated = await buildEmployeeResponse(id, tenantId)
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: rlHeaders })

  void deliverWebhook(tenantId, 'employee.updated', updated as Record<string, unknown>)

  return NextResponse.json(updated, { headers: rlHeaders })
  } catch (err) {
    void logSystemError({
      tenantId,
      route: '/api/v1/employees/[id]',
      method: 'PATCH',
      error: err,
      context: { employeeId: id },
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500, headers: rlHeaders })
  }
}
