import { type NextRequest, NextResponse } from 'next/server'
import { getClientIp, writeAuditLog } from '@/lib/audit/log'
import { getApiUser } from '@/lib/auth'
import { canWriteClinical } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { cancelRecallsFromRevokedExamination } from '@/lib/recalls/upsert-from-examination'
import { logSystemError } from '@/lib/system-log/error-log'
import { asObject } from '@/lib/validation'
import { deliverWebhook } from '@/lib/webhooks/deliver'

/**
 * POST /api/examinations/[id]/revoke
 *
 * Withdraw (retrage) a signed fișă de aptitudine.
 *
 * The problem this solves: a signed examination is immutable, deliberately
 * so — the worker may already have handed the printed fișă to their
 * employer, and a verdict that could be silently rewritten afterwards
 * would be worthless as a legal attestation. But "immutable" previously
 * also meant "no way to withdraw", which left a real clinical gap: a
 * practitioner who signs `apt` and then receives lab results showing the
 * worker is unfit had no way to invalidate the document. The old fișă
 * stayed valid-looking in the system and on paper, and a newer examination
 * neither superseded nor flagged it.
 *
 * Revocation resolves that without breaking immutability. The verdict and
 * all clinical fields stay exactly as signed. What changes is the
 * document's standing: it is marked retrasă, carries a reason, names who
 * withdrew it and when, and can point at the examination that replaces it.
 * Both the HTML fișă and the PDF render that state prominently, so a
 * reprint can never be mistaken for a valid certificate.
 *
 * Preconditions:
 *   - the examination is signed (an unsigned one needs /cancel or DELETE,
 *     not revocation — there is no issued document to withdraw)
 *   - it is not already revoked
 *   - a non-empty reason is supplied
 *
 * Side effects:
 *   - recalls derived from this examination are cancelled, since the
 *     schedule they encode rests on a withdrawn verdict
 *   - audit log entry with the dedicated `revoke` action
 *   - `examination.revoked` webhook, so an integrated HR system can react
 *     to a certificate it may have already consumed
 *
 * Revocation is final by design: there is no un-revoke endpoint. Undoing a
 * withdrawal would mean reinstating a document the cabinet has formally
 * disowned, and the honest way to do that is a fresh examination.
 *
 * Authorization: clinical write (practitioner / practice_admin). An
 * assistant cannot withdraw a medical attestation.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

/** Keeps a reason meaningful without being onerous to type. */
const MIN_REASON_LENGTH = 10
const MAX_REASON_LENGTH = 2000

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteClinical(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

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

  // Reason is mandatory. A withdrawal with no stated cause is not an audit
  // trail, it is a hole in one.
  const reasonRaw = body.revocationReason ?? body.reason
  let reason = ''
  if (typeof reasonRaw !== 'string') {
    issues.push('revocationReason is required and must be a string')
  } else {
    reason = reasonRaw.trim()
    if (reason.length < MIN_REASON_LENGTH) {
      issues.push(`revocationReason must be at least ${MIN_REASON_LENGTH} characters`)
    } else if (reason.length > MAX_REASON_LENGTH) {
      issues.push(`revocationReason must be at most ${MAX_REASON_LENGTH} characters`)
    }
  }

  // Optional pointer to the replacement examination.
  let supersededById: string | null = null
  if (
    body.supersededByExaminationId !== undefined &&
    body.supersededByExaminationId !== null &&
    body.supersededByExaminationId !== ''
  ) {
    if (typeof body.supersededByExaminationId !== 'string') {
      issues.push('supersededByExaminationId must be a string')
    } else if (body.supersededByExaminationId === id) {
      issues.push('An examination cannot supersede itself')
    } else {
      supersededById = body.supersededByExaminationId
    }
  }

  if (issues.length > 0) {
    return NextResponse.json({ error: 'validation_failed', issues }, { status: 400 })
  }

  try {
    const existing = await prisma.examination.findFirst({
      where: { id, tenantId: auth.user.tenantId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        employeeId: true,
        examinationNumber: true,
        verdict: true,
        signedAt: true,
        revokedAt: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // Only an issued document can be withdrawn.
    if (!existing.signedAt) {
      return NextResponse.json(
        {
          error: 'not_signed',
          message:
            'Only a signed examination can be revoked. An unsigned examination can still be edited, cancelled or deleted.',
        },
        { status: 409 }
      )
    }

    if (existing.revokedAt) {
      return NextResponse.json(
        {
          error: 'already_revoked',
          message: 'This examination has already been revoked.',
        },
        { status: 409 }
      )
    }

    // Validate the replacement, if one was named: it must be a real signed
    // examination in this tenant for the same employee. Pointing a
    // withdrawal at an unrelated worker's fișă would corrupt the record
    // rather than clarify it.
    if (supersededById) {
      const replacement = await prisma.examination.findFirst({
        where: {
          id: supersededById,
          tenantId: auth.user.tenantId,
          deletedAt: null,
        },
        select: { id: true, employeeId: true, signedAt: true },
      })
      if (!replacement) {
        return NextResponse.json(
          {
            error: 'validation_failed',
            issues: ['supersededByExaminationId does not exist in this tenant'],
          },
          { status: 400 }
        )
      }
      if (replacement.employeeId !== existing.employeeId) {
        return NextResponse.json(
          {
            error: 'validation_failed',
            issues: ['supersededByExaminationId must belong to the same employee'],
          },
          { status: 400 }
        )
      }
      if (!replacement.signedAt) {
        return NextResponse.json(
          {
            error: 'validation_failed',
            issues: ['supersededByExaminationId must itself be a signed examination'],
          },
          { status: 400 }
        )
      }
    }

    const now = new Date()

    const { updated, cancelledRecalls } = await prisma.$transaction(async (tx) => {
      // revokedAt: null in the WHERE makes this atomic against a
      // concurrent revoke — the loser matches no row and gets a 409,
      // rather than overwriting the first revocation's reason and author.
      const result = await tx.examination.updateMany({
        where: {
          id,
          tenantId: existing.tenantId,
          signedAt: { not: null },
          revokedAt: null,
          deletedAt: null,
        },
        data: {
          revokedAt: now,
          revokedByUserId: auth.user!.id,
          revocationReason: reason,
          supersededByExaminationId: supersededById,
        },
      })
      if (result.count === 0) {
        throw new Error('CONCURRENT_REVOKE')
      }

      const cancelled = await cancelRecallsFromRevokedExamination(tx, {
        examinationId: id,
        tenantId: existing.tenantId,
        examinationNumber: existing.examinationNumber,
      })

      const exam = await tx.examination.findFirst({
        where: { id },
        select: {
          id: true,
          examinationNumber: true,
          employeeId: true,
          verdict: true,
          signedAt: true,
          revokedAt: true,
          revocationReason: true,
          supersededByExaminationId: true,
        },
      })
      if (!exam) throw new Error('CONCURRENT_REVOKE')

      return { updated: exam, cancelledRecalls: cancelled }
    })

    // Side effects below are deliberately individually guarded: none of
    // them is allowed to fail the revocation, which is already committed.
    try {
      await writeAuditLog({
        tenantId: auth.user.tenantId,
        userId: auth.user.id,
        action: 'revoke',
        entityType: 'examination',
        entityId: id,
        entitySummary: `Retragere fișă aptitudine ${existing.examinationNumber} — ${existing.employee.lastName} ${existing.employee.firstName} (verdict semnat: ${existing.verdict ?? '—'}). Motiv: ${reason}`,
        ipAddress: getClientIp(request),
      })
    } catch (auditErr) {
      void logSystemError({
        tenantId: auth.user.tenantId,
        route: '/api/examinations/[id]/revoke',
        method: 'POST',
        error: auditErr,
        context: { examinationId: id, stage: 'audit_log' },
      })
    }

    void deliverWebhook(auth.user.tenantId, 'examination.revoked', {
      examinationId: id,
      examinationNumber: updated.examinationNumber,
      employeeId: updated.employeeId,
      employeeName: `${existing.employee.firstName} ${existing.employee.lastName}`,
      signedVerdict: updated.verdict,
      revokedAt: updated.revokedAt,
      revocationReason: updated.revocationReason,
      supersededByExaminationId: updated.supersededByExaminationId,
    })

    return NextResponse.json({
      examination: updated,
      cancelledRecalls,
    })
  } catch (err) {
    if ((err as Error).message === 'CONCURRENT_REVOKE') {
      return NextResponse.json(
        {
          error: 'already_revoked',
          message: 'This examination was revoked by a concurrent request.',
        },
        { status: 409 }
      )
    }
    void logSystemError({
      tenantId: auth.user.tenantId,
      route: '/api/examinations/[id]/revoke',
      method: 'POST',
      error: err,
      context: { examinationId: id },
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
