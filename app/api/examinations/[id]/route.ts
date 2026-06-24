import { type NextRequest, NextResponse } from 'next/server'
import type { ExaminationVerdict } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteAdministrative,
  canWriteClinical,
} from '@/lib/permissions/tenant-data'
import { asObject, optionalDate, optionalString } from '@/lib/validation'

/**
 * Single examination operations.
 *
 *   GET    — full record with all relations
 *   PATCH  — update clinical data, verdict, notes
 *   DELETE — soft-delete; only allowed while UNSIGNED. Signed exams are
 *            legal records and cannot be removed via the API. (A
 *            separate "annul" workflow with audit trail would be needed
 *            for that — future session.)
 *
 * Immutability after signing: PATCH on a signed examination is refused.
 * If the practitioner needs to correct a signed exam, the current
 * workflow is to cancel + re-create. This matches medical recordkeeping
 * norms — once signed and given to the patient, it's "issued."
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

// Top-level fields the practitioner can update. JSONB fields are listed
// separately and handled as whole-object replacements.
const TOP_LEVEL_STRING_FIELDS = [
  'clinicalFindings',
  'recommendations',
  'verdictConditions',
  'referringDocumentNumber',
  'notes',
] as const

const JSONB_FIELDS = [
  'anamnesis',
  'vitalSigns',
  'visionTest',
  'hearingTest',
  'lungFunction',
  'additionalTests',
  'maternityRisk',
  'diagnoses',
] as const

const VALID_VERDICTS: ExaminationVerdict[] = [
  'apt',
  'apt_conditionat',
  'inapt_temporar',
  'inapt',
]

async function loadExaminationForActor(id: string, tenantId: string) {
  return prisma.examination.findFirst({
    where: { id, tenantId, deletedAt: null },
  })
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
  const examination = await prisma.examination.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    include: {
      employee: true,
      workplace: {
        include: {
          company: { select: { id: true, name: true } },
        },
      },
      examinationType: true,
      practitioner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          professionalTitle: true,
          professionalCode: true,
        },
      },
      location: true,
    },
  })

  if (!examination) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ examination })
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  // Clinical write — only practitioner/practice_admin can edit examination
  // fields. Assistants are blocked.
  if (!auth.user.tenantId || !canWriteClinical(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const existing = await loadExaminationForActor(id, auth.user.tenantId)
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (existing.signedAt) {
    return NextResponse.json(
      {
        error: 'already_signed',
        message:
          'This examination has been signed and is immutable. Cancel and create a new one if a correction is required.',
      },
      { status: 409 }
    )
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

  // Clearable string fields — empty/null clears, undefined leaves alone.
  for (const field of TOP_LEVEL_STRING_FIELDS) {
    if (!(field in body)) continue
    const incoming = body[field]
    if (incoming === null || incoming === '') {
      updateData[field] = null
    } else if (typeof incoming === 'string') {
      const trimmed = incoming.trim()
      if (trimmed === '') {
        updateData[field] = null
      } else if (trimmed.length > 8000) {
        issues.push(`${field} too long (max 8000 chars)`)
      } else {
        updateData[field] = trimmed
      }
    } else {
      issues.push(`${field} must be a string`)
    }
  }

  // JSONB sub-forms: client sends the whole object, we store as-is.
  // We don't merge — client is the source of truth for the structure
  // and we trust it not to send junk. Validation can be added per-shape
  // later when the JSONB schemas stabilize.
  for (const field of JSONB_FIELDS) {
    if (!(field in body)) continue
    const incoming = body[field]
    if (incoming === null) {
      updateData[field] = field === 'diagnoses' ? [] : {}
    } else if (typeof incoming === 'object') {
      updateData[field] = incoming
    } else {
      issues.push(`${field} must be an object or array`)
    }
  }

  // Verdict.
  if ('verdict' in body) {
    if (body.verdict === null || body.verdict === '') {
      updateData.verdict = null
      // Clearing verdict also clears inaptTemporarUntil.
      updateData.inaptTemporarUntil = null
    } else if (typeof body.verdict !== 'string' ||
               !VALID_VERDICTS.includes(body.verdict as ExaminationVerdict)) {
      issues.push(`verdict must be one of: ${VALID_VERDICTS.join(', ')}`)
    } else {
      updateData.verdict = body.verdict
    }
  }

  // inapt_temporar end date.
  if ('inaptTemporarUntil' in body) {
    if (body.inaptTemporarUntil === null || body.inaptTemporarUntil === '') {
      updateData.inaptTemporarUntil = null
    } else {
      const parsed = optionalDate(
        'inaptTemporarUntil',
        body.inaptTemporarUntil,
        issues
      )
      if (parsed) updateData.inaptTemporarUntil = parsed
    }
  }

  // nextExaminationDueDate override (Q4 — practitioner can override).
  if ('nextExaminationDueDate' in body) {
    if (
      body.nextExaminationDueDate === null ||
      body.nextExaminationDueDate === ''
    ) {
      updateData.nextExaminationDueDate = null
    } else {
      const parsed = optionalDate(
        'nextExaminationDueDate',
        body.nextExaminationDueDate,
        issues
      )
      if (parsed) updateData.nextExaminationDueDate = parsed
    }
  }

  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ examination: existing })
  }

  // Cross-field: if verdict is inapt_temporar, inaptTemporarUntil is
  // expected (but not strictly required at the PATCH level — sign step
  // will enforce). Don't block here.

  // Include signedAt: null in WHERE so a concurrent sign that lands
  // between the check above and this update causes count=0 → 409 instead
  // of silently overwriting a signed (immutable) record.
  const patchResult = await prisma.examination.updateMany({
    where: { id, signedAt: null, deletedAt: null, tenantId: auth.user.tenantId },
    data: updateData,
  })
  if (patchResult.count === 0) {
    return NextResponse.json(
      { error: 'already_signed', message: 'This examination was signed by a concurrent request and is now immutable.' },
      { status: 409 }
    )
  }

  const updated = await prisma.examination.findFirst({ where: { id } })
  return NextResponse.json({ examination: updated })
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  // Administrative — assistants can delete misclicked examination records
  // (only those not yet started). Clinical deletion of in-progress/signed
  // exams is blocked downstream by the immutability check.
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const existing = await loadExaminationForActor(id, auth.user.tenantId)
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Hard rule: signed exams cannot be deleted via this endpoint.
  if (existing.signedAt) {
    return NextResponse.json(
      {
        error: 'already_signed',
        message:
          'Signed examinations cannot be deleted. They are legal records.',
      },
      { status: 409 }
    )
  }

  await prisma.examination.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      status: 'cancelled',
    },
  })

  return NextResponse.json({ ok: true })
}
