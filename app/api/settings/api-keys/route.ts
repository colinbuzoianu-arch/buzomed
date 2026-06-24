import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { generateApiKey } from '@/lib/api-keys/generate'
import { API_SCOPES, type ApiScope } from '@/lib/api-keys/scopes'
import { asObject, optionalString } from '@/lib/validation'

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

  const keys = await prisma.apiKey.findMany({
    where: { tenantId: auth.user.tenantId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ keys })
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

  const name = optionalString('name', body.name, issues, { maxLength: 100 })
  if (!name) issues.push('name is required')

  if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
    issues.push('scopes must be a non-empty array')
  }
  const validScopes = Object.keys(API_SCOPES) as ApiScope[]
  const scopes: ApiScope[] = []
  if (Array.isArray(body.scopes)) {
    for (const s of body.scopes) {
      if (!validScopes.includes(s as ApiScope)) {
        issues.push(`invalid scope: ${s}`)
      } else {
        scopes.push(s as ApiScope)
      }
    }
  }

  let expiresAt: Date | null = null
  if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== '') {
    if (typeof body.expiresAt !== 'string') {
      issues.push('expiresAt must be an ISO datetime string')
    } else {
      const parsed = new Date(body.expiresAt)
      if (isNaN(parsed.getTime())) {
        issues.push('expiresAt is not a valid ISO datetime')
      } else {
        expiresAt = parsed
      }
    }
  }

  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }

  const { raw: rawKey, hash, prefix } = generateApiKey()

  const key = await prisma.apiKey.create({
    data: {
      tenantId: auth.user.tenantId,
      name: name!,
      keyHash: hash,
      keyPrefix: prefix,
      scopes,
      expiresAt,
      createdByUserId: auth.user.id,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      expiresAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ key, raw: rawKey }, { status: 201 })
}
