import { type NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { encryptWebhookSecret } from '@/lib/webhooks/secret'
import type { WebhookEvent } from '@/lib/webhooks/events'
import { asObject, optionalString } from '@/lib/validation'
import { assertSafeWebhookUrl } from '@/lib/webhooks/url-guard'

const VALID_EVENTS: WebhookEvent[] = [
  'examination.signed',
  'examination.scheduled',
  'examination.completed',
  'recall.due_soon',
  'employee.created',
  'employee.updated',
]

export async function GET() {
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

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId: auth.user.tenantId },
    select: {
      id: true,
      url: true,
      description: true,
      events: true,
      secretPrefix: true,
      isActive: true,
      lastTriggeredAt: true,
      failureCount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ endpoints })
}

export async function POST(request: NextRequest) {
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

  const url = optionalString('url', body.url, issues, { maxLength: 2048 })
  if (!url) {
    issues.push('url is required')
  } else {
    try {
      await assertSafeWebhookUrl(url)
    } catch (err) {
      issues.push(`url rejected: ${(err as Error).message}`)
    }
  }

  const description = optionalString('description', body.description, issues, { maxLength: 500 })

  if (!Array.isArray(body.events) || body.events.length === 0) {
    issues.push('events must be a non-empty array')
  }
  const events: WebhookEvent[] = []
  if (Array.isArray(body.events)) {
    for (const e of body.events) {
      if (!VALID_EVENTS.includes(e as WebhookEvent)) {
        issues.push(`invalid event: ${e}`)
      } else {
        events.push(e as WebhookEvent)
      }
    }
  }

  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }

  const rawSecret = 'whs_' + randomBytes(16).toString('hex')
  const secretEncrypted = encryptWebhookSecret(rawSecret)
  const secretPrefix = rawSecret.slice(0, 10)

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      tenantId: auth.user.tenantId,
      url: url!,
      description: description ?? null,
      events,
      secretEncrypted,
      secretPrefix,
    },
    select: {
      id: true,
      url: true,
      description: true,
      events: true,
      secretPrefix: true,
      isActive: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ endpoint, rawSecret }, { status: 201 })
}
