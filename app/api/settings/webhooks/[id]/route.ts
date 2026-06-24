import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import type { WebhookEvent } from '@/lib/webhooks/events'
import { asObject, optionalString } from '@/lib/validation'

const VALID_EVENTS: WebhookEvent[] = [
  'examination.signed',
  'examination.scheduled',
  'examination.completed',
  'recall.due_soon',
  'employee.created',
  'employee.updated',
]

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 403 })
  }
  if (!auth.user.roles.includes('practice_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id, tenantId: auth.user.tenantId },
    select: { id: true },
  })
  if (!existing) {
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
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const issues: string[] = []
  const patch: Record<string, unknown> = {}

  if (body.url !== undefined) {
    const url = optionalString('url', body.url, issues, { maxLength: 2048 })
    if (url && !url.startsWith('https://')) issues.push('url must start with https://')
    patch.url = url
  }

  if (body.description !== undefined) {
    patch.description = optionalString('description', body.description, issues, { maxLength: 500 }) ?? null
  }

  if (body.events !== undefined) {
    if (!Array.isArray(body.events) || body.events.length === 0) {
      issues.push('events must be a non-empty array')
    } else {
      const events: WebhookEvent[] = []
      for (const e of body.events) {
        if (!VALID_EVENTS.includes(e as WebhookEvent)) {
          issues.push(`invalid event: ${e}`)
        } else {
          events.push(e as WebhookEvent)
        }
      }
      patch.events = events
    }
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      issues.push('isActive must be a boolean')
    } else {
      patch.isActive = body.isActive
    }
  }

  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }

  const endpoint = await prisma.webhookEndpoint.update({
    where: { id },
    data: patch,
    select: {
      id: true,
      url: true,
      description: true,
      events: true,
      secretPrefix: true,
      isActive: true,
      failureCount: true,
      lastTriggeredAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ endpoint })
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 403 })
  }
  if (!auth.user.roles.includes('practice_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id, tenantId: auth.user.tenantId },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  await prisma.webhookEndpoint.update({
    where: { id },
    data: { isActive: false },
  })

  return NextResponse.json({ ok: true })
}
