import { type NextRequest, NextResponse } from 'next/server'
import { type ContractStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteAdministrative,
} from '@/lib/permissions/tenant-data'
import {
  asObject,
  optionalDate,
  optionalString,
  requireString,
} from '@/lib/validation'
import { createContractWithNumber } from '@/lib/contracts/numbering'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function loadCompanyForActor(companyId: string, tenantId: string) {
  return prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: { id: true, tenantId: true },
  })
}

const VALID_STATUSES: ContractStatus[] = ['draft', 'active', 'expired', 'terminated']

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId } = await ctx.params
  const company = await loadCompanyForActor(companyId, auth.user.tenantId)
  if (!company) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const contracts = await prisma.contract.findMany({
    where: { tenantId: auth.user.tenantId, companyId, deletedAt: null },
    orderBy: [{ contractYear: 'desc' }, { contractSequence: 'desc' }],
  })

  return NextResponse.json({ contracts })
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: companyId } = await ctx.params
  const company = await loadCompanyForActor(companyId, auth.user.tenantId)
  if (!company) {
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
    return NextResponse.json({ error: 'invalid_json', message: 'Body must be a JSON object' }, { status: 400 })
  }

  const issues: string[] = []
  const data = parseContractInput(body, issues, { isCreate: true })
  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }

  const tenantId = auth.user.tenantId

  const contract = await createContractWithNumber(
    tenantId,
    (n) => ({
      tenant: { connect: { id: tenantId } },
      company: { connect: { id: companyId } },
      contractNumber: n.number,
      contractYear: n.year,
      contractSequence: n.sequence,
      startDate: data.startDate!,
      endDate: data.endDate,
      services: data.services ?? [],
      pricePerExamination: data.pricePerExamination != null
        ? new Prisma.Decimal(data.pricePerExamination)
        : undefined,
      priceMonthlyFlat: data.priceMonthlyFlat != null
        ? new Prisma.Decimal(data.priceMonthlyFlat)
        : undefined,
      currency: data.currency ?? 'RON',
      status: data.status ?? 'draft',
      notes: data.notes,
    }),
    (created) => created
  )

  return NextResponse.json({ contract }, { status: 201 })
}

export interface ParsedContractInput {
  startDate?: Date
  endDate?: Date
  services?: string[]
  pricePerExamination?: number
  priceMonthlyFlat?: number
  currency?: string
  status?: ContractStatus
  notes?: string
}

export function parseContractInput(
  body: Record<string, unknown>,
  issues: string[],
  opts: { isCreate: boolean }
): ParsedContractInput {
  const result: ParsedContractInput = {}

  if (opts.isCreate) {
    result.startDate = optionalDate('startDate', body.startDate, issues)
    if (!result.startDate) {
      issues.push('startDate is required')
    }
  } else {
    result.startDate = optionalDate('startDate', body.startDate, issues)
  }

  result.endDate = optionalDate('endDate', body.endDate, issues)

  if (result.startDate && result.endDate && result.endDate < result.startDate) {
    issues.push('endDate must be after startDate')
  }

  if (body.services !== undefined) {
    if (!Array.isArray(body.services)) {
      issues.push('services must be an array')
    } else {
      result.services = (body.services as unknown[])
        .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
        .map((s) => s.trim())
    }
  }

  for (const field of ['pricePerExamination', 'priceMonthlyFlat'] as const) {
    if (body[field] !== undefined && body[field] !== null) {
      const v = body[field]
      if (typeof v !== 'number' || isNaN(v) || v < 0) {
        issues.push(`${field} must be a non-negative number`)
      } else {
        result[field] = v
      }
    }
  }

  const currency = optionalString('currency', body.currency, issues, { maxLength: 3 })
  if (currency) result.currency = currency

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as ContractStatus)) {
      issues.push(`status must be one of: ${VALID_STATUSES.join(', ')}`)
    } else {
      result.status = body.status as ContractStatus
    }
  }

  result.notes = optionalString('notes', body.notes, issues, { maxLength: 4000 })

  return result
}
