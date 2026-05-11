import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteTenantData } from '@/lib/permissions/tenant-data'
import { asObject, optionalString } from '@/lib/validation'

/**
 * Single-assignment operations:
 *
 *   PATCH /api/employees/[id]/assignments/[aid]
 *     - { end: true, endDate?: 'YYYY-MM-DD' }   — close an open assignment
 *     - { notes: '...' }                         — update the notes field
 *
 * Once an assignment has endDate set, it can't be reopened. To "undo"
 * ending an assignment, start a new one via POST.
 *
 * We deliberately don't allow editing startDate / workplaceId after
 * creation — those would let users rewrite history. If the assignment
 * was created wrong, end it (with endDate = startDate) and create a
 * new one with the right values.
 */

interface RouteContext {
  params: Promise<{ id: string; aid: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canWriteTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: employeeId, aid } = await ctx.params

  const assignment = await prisma.employeeWorkplaceAssignment.findFirst({
    where: {
      id: aid,
      employeeId,
      tenantId: auth.user.tenantId,
    },
  })
  if (!assignment) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const body = asObject(raw)
  if (!body) {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Body must be a JSON object' },
      { status: 400 }
    )
  }

  const issues: string[] = []
  const updateData: Record<string, unknown> = {}

  if (body.end === true) {
    if (!assignment.isCurrent) {
      issues.push('Assignment is already ended')
    } else {
      // Optional endDate, defaults to today.
      let endDate: Date
      if (body.endDate === undefined || body.endDate === null || body.endDate === '') {
        const now = new Date()
        endDate = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        )
      } else if (
        typeof body.endDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate)
      ) {
        issues.push('endDate must be in YYYY-MM-DD format')
        endDate = new Date()
      } else {
        endDate = new Date(`${body.endDate}T00:00:00Z`)
      }
      if (endDate < assignment.startDate) {
        issues.push('endDate cannot be earlier than startDate')
      }
      updateData.isCurrent = false
      updateData.endDate = endDate
    }
  }

  if (body.notes !== undefined) {
    if (body.notes === null || body.notes === '') {
      updateData.notes = null
    } else {
      const notes = optionalString('notes', body.notes, issues, { maxLength: 1000 })
      if (notes !== undefined) updateData.notes = notes
    }
  }

  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ assignment })
  }

  const updated = await prisma.employeeWorkplaceAssignment.update({
    where: { id: aid },
    data: updateData,
    include: {
      workplace: {
        select: {
          id: true,
          name: true,
          department: true,
          companyId: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  })

  return NextResponse.json({ assignment: updated })
}
