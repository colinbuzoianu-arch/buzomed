import { type NextRequest, NextResponse } from 'next/server'
import type { AuditAction } from '@prisma/client'
import { getApiUser } from '@/lib/auth'
import { getRequestMeta, writeAuditLog } from '@/lib/audit/log'
import { createClient } from '@/lib/supabase/server'

/**
 * Records a 2FA lifecycle event for the CURRENT user in the audit log. The
 * actual MFA mutations (enroll / verify / unenroll) happen client-side through
 * the Supabase JS SDK; this endpoint exists only so those events land in our
 * audit trail, which lives in Postgres (writeAuditLog → Prisma).
 *
 * Events:
 *   - enabled  → logged after a factor is verified (session is now AAL2)
 *   - disabled → logged after the user removes one of their own factors (AAL2)
 *   - failed   → a wrong/expired code at the 2FA login step (user is still AAL1,
 *                which is why the 2FA gate in middleware whitelists this route)
 *
 * The event is always attributed to the authenticated user — a half-logged-in
 * caller cannot forge an event for someone else. We additionally require AAL2
 * for enabled/disabled so a caller stuck at the password step can't write a
 * bogus "2FA enabled" entry; "failed" is deliberately allowed at AAL1.
 */
const EVENT_TO_ACTION: Record<string, AuditAction> = {
  enabled: 'mfa_enabled',
  disabled: 'mfa_disabled',
  failed: 'mfa_failed',
}

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const event = typeof body?.event === 'string' ? body.event : ''
  const action = EVENT_TO_ACTION[event]
  if (!action) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  // enabled/disabled are only legitimate once the session is fully elevated.
  if (event === 'enabled' || event === 'disabled') {
    const supabase = await createClient()
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (data?.currentLevel !== 'aal2') {
      return NextResponse.json({ error: 'mfa_level_required' }, { status: 403 })
    }
  }

  const { ipAddress, userAgent } = getRequestMeta(request)
  await writeAuditLog({
    tenantId: auth.user.tenantId,
    userId: auth.user.id,
    action,
    entityType: 'user',
    entityId: auth.user.id,
    entitySummary: `${auth.user.lastName} ${auth.user.firstName}`,
    ipAddress,
    userAgent,
  })

  return NextResponse.json({ ok: true })
}
