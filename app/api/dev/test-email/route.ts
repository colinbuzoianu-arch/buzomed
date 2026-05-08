import { NextResponse } from 'next/server'
import { renderInviteEmail, sendEmail } from '@/lib/email'

/**
 * Dev-only smoke test for the email module.
 *
 * GET /api/dev/test-email?email=you@example.com&locale=ro
 *
 * Hard-gated to NODE_ENV !== 'production' so this never accidentally
 * ships. Even within dev, only sends to the address you specify in
 * the query — so you can verify deliverability to your own inbox.
 *
 * Remove this file before going to production, or convert into a
 * proper admin tool with auth.
 */

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 404 }
    )
  }

  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  const locale = (searchParams.get('locale') ?? 'ro') as 'ro' | 'en'

  if (!email) {
    return NextResponse.json(
      {
        error:
          'Missing ?email parameter. Example: /api/dev/test-email?email=you@example.com&locale=ro',
      },
      { status: 400 }
    )
  }

  if (locale !== 'ro' && locale !== 'en') {
    return NextResponse.json(
      { error: "locale must be 'ro' or 'en'" },
      { status: 400 }
    )
  }

  // Render a fake invite for testing
  const content = renderInviteEmail({
    recipientEmail: email,
    recipientName: undefined,
    inviterName: 'Colin Buzoianu',
    tenantName: 'Cabinet Test SRL',
    role: 'practitioner',
    acceptUrl:
      'http://localhost:3000/accept-invite/dev-test-token-not-real-12345',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    locale,
  })

  const result = await sendEmail({
    to: { email },
    content,
    tags: ['dev-smoke-test', 'invite-template'],
    headers: {
      'X-Buzomed-Template': 'invite',
      'X-Buzomed-Env': 'dev',
    },
  })

  if (!result.success) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    messageId: result.messageId,
    sentTo: email,
    locale,
    note: 'Check your inbox. If it is in spam, that is normal for first sends from a new domain — mark it "not spam" to train the filter.',
  })
}
