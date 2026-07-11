import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.buzomed.com'

function normalize(email: string): string {
  return email.trim().toLowerCase()
}

export async function isSuppressed(email: string): Promise<boolean> {
  const row = await prisma.emailSuppression.findUnique({
    where: { email: normalize(email) },
    select: { id: true },
  })
  return row !== null
}

export async function suppress(email: string, reason?: string): Promise<void> {
  const normalized = normalize(email)
  await prisma.emailSuppression.upsert({
    where: { email: normalized },
    update: {},
    create: { email: normalized, reason: reason ?? null },
  })
}

/**
 * Returns undefined (instead of throwing) when EMAIL_UNSUBSCRIBE_SECRET isn't
 * configured, so a missing/misconfigured secret can never take down a core
 * flow (e.g. tenant creation) that happens to trigger an email send along the
 * way. Logs loudly so the misconfiguration is visible in server logs.
 */
export function generateUnsubscribeToken(email: string): string | undefined {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET
  if (!secret) {
    console.error('[email] EMAIL_UNSUBSCRIBE_SECRET is not configured — sending without an unsubscribe link')
    return undefined
  }
  return createHmac('sha256', secret).update(normalize(email)).digest('hex')
}

/** Fails closed: if the secret is missing, no token can be verified valid. */
export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(email)
  if (!expected) return false
  const expectedBuf = Buffer.from(expected, 'hex')
  const tokenBuf = Buffer.from(token, 'hex')
  if (expectedBuf.length !== tokenBuf.length) return false
  return timingSafeEqual(expectedBuf, tokenBuf)
}

export function generateUnsubscribeUrl(email: string): string | undefined {
  const token = generateUnsubscribeToken(email)
  if (!token) return undefined
  const params = new URLSearchParams({ email: normalize(email), token })
  return `${APP_URL}/api/email/unsubscribe?${params.toString()}`
}
