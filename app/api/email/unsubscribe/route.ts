import { type NextRequest, NextResponse } from 'next/server'
import { suppress, verifyUnsubscribeToken } from '@/lib/email/suppression'

function confirmationPage(): string {
  return `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Dezabonare — Buzomed</title>
</head>
<body style="margin:0; padding:0; background-color:#f9fafb; font-family: Arial, Helvetica, sans-serif; color:#1f2937;">
<div style="max-width:480px; margin:64px auto; padding:32px; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; text-align:center;">
<h1 style="font-size:18px; margin:0 0 12px 0; color:#1d4f99;">Buzomed</h1>
<p style="font-size:15px; line-height:1.6;">Te-ai dezabonat cu succes.</p>
<p style="font-size:13px; color:#6b7280;">Nu vei mai primi acest tip de email de la noi.</p>
</div>
</body>
</html>`
}

function invalidLinkPage(): string {
  return `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Link invalid — Buzomed</title>
</head>
<body style="margin:0; padding:0; background-color:#f9fafb; font-family: Arial, Helvetica, sans-serif; color:#1f2937;">
<div style="max-width:480px; margin:64px auto; padding:32px; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; text-align:center;">
<h1 style="font-size:18px; margin:0 0 12px 0; color:#1d4f99;">Buzomed</h1>
<p style="font-size:15px; line-height:1.6;">Link invalid sau expirat.</p>
</div>
</body>
</html>`
}

function htmlResponse(html: string, status: number): NextResponse {
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function handleUnsubscribe(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  const token = searchParams.get('token')

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    return htmlResponse(invalidLinkPage(), 400)
  }

  await suppress(email, 'user-initiated')
  return htmlResponse(confirmationPage(), 200)
}

// GET — a person clicking the link in the email body.
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleUnsubscribe(request)
}

// POST — RFC 8058 one-click unsubscribe (List-Unsubscribe-Post), used by
// mail clients that offer an "Unsubscribe" button next to the sender.
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleUnsubscribe(request)
}
