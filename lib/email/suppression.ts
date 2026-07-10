import { createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.buzomed.com'

function normalize(email: string): string {
  return email.trim().toLowerCase()
}

function getSecret(): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET
  if (!secret) throw new Error('EMAIL_UNSUBSCRIBE_SECRET is not configured')
  return secret
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

export function generateUnsubscribeToken(email: string): string {
  return createHmac('sha256', getSecret()).update(normalize(email)).digest('hex')
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(email)
  const expectedBuf = Buffer.from(expected, 'hex')
  const tokenBuf = Buffer.from(token, 'hex')
  if (expectedBuf.length !== tokenBuf.length) return false
  return timingSafeEqual(expectedBuf, tokenBuf)
}

export function generateUnsubscribeUrl(email: string): string {
  const token = generateUnsubscribeToken(email)
  const params = new URLSearchParams({ email: normalize(email), token })
  return `${APP_URL}/api/email/unsubscribe?${params.toString()}`
}
