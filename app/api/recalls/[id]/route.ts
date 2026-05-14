import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteAdministrative,
} from '@/lib/permissions/tenant-data'
import { asObject, optionalString } from '@/lib/validation'

/**
 * Single recall operations.
 *
 *   GET   — detail view (rarely used directly; mostly the dashboard
 *           shows everything inline, but we expose this for future
 *           drill-down screens and for testing)
 *   PATCH — cancel a recall, with optional reason
 *
 * Recalls can't be "deleted" — once a recall has been created and the
 * cabinet has acknowledged it, cancellation is recorded as a state
 * change rather than a row deletion. Lets us audit later.
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
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const recall = await prisma.recall.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true },
      },
      workplace: {
        select: {
          id: true,
          name: true,
          department: true,
          company: { select: { id: true, name: true } },
        },
      },
      examinationType: true,
      createdFromExamination: {
        select: { id: true, examinationNumber: true, signedAt: true },
      },
    },
  })

  if (!recall) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ recall })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const body = asObject(raw) ?? {}

  const action = body.action
  if (action !== 'cancel') {
    return NextResponse.json(
      {
        error: 'invalid_action',
        message: "Only 'cancel' is supported via PATCH for now",
      },
      { status: 400 }
    )
  }

  const issues: string[] = []
  const note = optionalString('note', body.note, issues, { maxLength: 500 })
  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  const { id } = await ctx.params
  const existing = await prisma.recall.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true, status: true, notes: true },
  })

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (existing.status === 'completed' || existing.status === 'cancelled') {
    return NextResponse.json(
      {
        error: 'invalid_transition',
        message: `Recall is already ${existing.status}`,
      },
      { status: 409 }
    )
  }

  // Append the cancellation reason as a note for audit trail until the
  // dedicated audit log lands (session 10+).
  const stamp = new Date().toISOString()
  const reasonNote = note
    ? `[${stamp}] Cancelled by ${auth.user.id}: ${note}`
    : `[${stamp}] Cancelled by ${auth.user.id}`
  const newNotes = existing.notes
    ? `${existing.notes}\n${reasonNote}`
    : reasonNote

  const updated = await prisma.recall.update({
    where: { id },
    data: { status: 'cancelled', notes: newNotes },
  })

  return NextResponse.json({ recall: updated })
}
