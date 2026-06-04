import { randomBytes, createHash } from 'crypto'

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = 'bz_live_' + randomBytes(16).toString('hex')
  const hash = createHash('sha256').update(raw).digest('hex')
  const prefix = raw.slice(0, 16)
  return { raw, hash, prefix }
}
