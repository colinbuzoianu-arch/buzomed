import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const KEY_BYTES = 32

let cachedKey: Buffer | null = null

function loadKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.WEBHOOK_SECRET_KEY
  if (!raw) {
    throw new Error(
      'WEBHOOK_SECRET_KEY is not set. Generate one with: ' +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    )
  }
  const key = Buffer.from(raw, 'hex')
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `WEBHOOK_SECRET_KEY must decode to exactly ${KEY_BYTES} bytes (got ${key.length}).`
    )
  }
  cachedKey = key
  return key
}

export function encryptWebhookSecret(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptWebhookSecret(encoded: string): string {
  const key = loadKey()
  const blob = Buffer.from(encoded, 'base64')
  const iv = blob.subarray(0, IV_BYTES)
  const tag = blob.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES)
  const ciphertext = blob.subarray(IV_BYTES + AUTH_TAG_BYTES)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
