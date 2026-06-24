import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// IPv4 private/reserved/loopback/link-local ranges
const PRIVATE_IPV4_PREFIXES = [
  '0.', '10.', '127.',
  '169.254.',       // link-local — AWS/GCP/Azure IMDS
  '100.64.',        // CGNAT
  '192.0.0.', '192.0.2.', '192.168.',
  '198.18.', '198.19.', '198.51.100.',
  '203.0.113.', '224.', '240.', '255.255.255.255',
]

// 172.16.0.0/12
function isPrivateIPv4(ip: string): boolean {
  if (PRIVATE_IPV4_PREFIXES.some(p => ip.startsWith(p))) return true
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1] ?? '0', 10)
    if (second >= 16 && second <= 31) return true
  }
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  return (
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80') ||
    lower.startsWith('::ffff:') // IPv4-mapped
  )
}

/**
 * Validates that a webhook URL is safe to deliver to.
 * Throws with a short error code on any violation.
 * Called at registration time AND immediately before each delivery (defeats DNS rebinding).
 */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
  let url: URL
  try { url = new URL(rawUrl) } catch { throw new Error('invalid_url') }
  if (url.protocol !== 'https:') throw new Error('https_required')
  if (url.port && !['', '443'].includes(url.port)) throw new Error('non_standard_port')
  if (url.username || url.password) throw new Error('userinfo_not_allowed')

  const host = url.hostname
  const ipVersion = isIP(host)

  if (ipVersion !== 0) {
    // IP literal in URL — check range then reject regardless (require DNS names)
    if (ipVersion === 4 && isPrivateIPv4(host)) throw new Error('private_address')
    if (ipVersion === 6 && isPrivateIPv6(host)) throw new Error('private_address')
    throw new Error('ip_literal_not_allowed')
  }

  // DNS resolution — check ALL returned records to defeat round-robin pinning
  const records = await lookup(host, { all: true })
  for (const r of records) {
    if (r.family === 4 && isPrivateIPv4(r.address)) throw new Error('resolves_to_private')
    if (r.family === 6 && isPrivateIPv6(r.address)) throw new Error('resolves_to_private')
  }

  return url
}

// Set of error messages produced by assertSafeWebhookUrl — used by callers to
// distinguish an SSRF block from an unexpected network/infra error.
export const SSRF_BLOCK_MESSAGES = new Set([
  'invalid_url',
  'https_required',
  'non_standard_port',
  'userinfo_not_allowed',
  'private_address',
  'ip_literal_not_allowed',
  'resolves_to_private',
])
