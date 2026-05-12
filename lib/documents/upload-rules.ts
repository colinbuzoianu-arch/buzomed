/**
 * Upload validation + storage path construction.
 *
 * Centralizes our policy so route handlers stay thin:
 *   - which MIME types we accept
 *   - how big the file can be
 *   - how to translate a user-supplied filename into something safe to
 *     store and serve
 *   - how to construct the canonical storage path
 *
 * Keep this file in sync with prisma/setup-storage-bucket.sql — the bucket
 * enforces the same MIME + size caps at the storage layer, but we want
 * application-level checks to fail FAST with friendly errors before the
 * file even reaches Storage.
 */

import type { DocumentEntityType } from '@prisma/client'

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024 // 15 MB

/**
 * Accepted MIME types. Maps the canonical MIME to a short label used in
 * error messages.
 */
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'DOCX',
}

export function isAllowedMime(mime: string): boolean {
  return mime in ALLOWED_MIME_TYPES
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Sanitize a user-supplied filename for storage. We want:
 *   - keep the extension
 *   - strip directory traversal characters (`/`, `\`, `..`)
 *   - strip control chars and most special chars; keep letters, digits,
 *     diacritics, dot, dash, underscore, space (later collapsed)
 *   - truncate to a reasonable length
 *
 * The result is suffixed with the file extension if the original had one.
 * If the input is all-junk (e.g. "??????.exe"), we fall back to a generic
 * name. The original filename is also stored verbatim in Document.filename
 * for display, so this transformation only matters for the storage path.
 */
export function sanitizeFilename(input: string): string {
  if (typeof input !== 'string') return 'document'

  // Strip any path-like prefix the browser might have included.
  const baseRaw = input.replace(/\\/g, '/').split('/').pop() ?? ''
  if (!baseRaw) return 'document'

  // Extract extension first.
  const dotIdx = baseRaw.lastIndexOf('.')
  const stem = dotIdx > 0 ? baseRaw.slice(0, dotIdx) : baseRaw
  const ext = dotIdx > 0 ? baseRaw.slice(dotIdx + 1).toLowerCase() : ''

  // Sanitize stem.
  let cleanStem = stem
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}._\- ]+/gu, '') // keep letters/digits/dot/dash/underscore/space
    .replace(/\.+/g, '.') // collapse runs of dots (prevents `..` traversal)
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
  if (!cleanStem) cleanStem = 'document'

  // Sanitize extension — alphanumeric, 1-8 chars.
  const cleanExt =
    ext && /^[a-z0-9]{1,8}$/.test(ext) ? ext : ''

  return cleanExt ? `${cleanStem}.${cleanExt}` : cleanStem
}

/**
 * Build the canonical storage path for a new document.
 *
 *   {tenantId}/{entityType}/{entityId}/{uuid}-{safeFilename}
 *
 * The UUID prefix prevents collisions between two files with the same name
 * uploaded to the same entity. The tenantId prefix gives us a visual
 * hierarchy in the Supabase Storage browser and matches the data model.
 */
export function buildStoragePath(params: {
  tenantId: string
  entityType: DocumentEntityType
  entityId: string
  uniqueId: string
  filename: string
}): string {
  const safe = sanitizeFilename(params.filename)
  return `${params.tenantId}/${params.entityType}/${params.entityId}/${params.uniqueId}-${safe}`
}

/**
 * Suggest a Romanian-language hint for the rejected upload.
 * Used by the UI to render friendlier errors than the raw MIME string.
 */
export function describeAllowed(): string {
  return Object.values(ALLOWED_MIME_TYPES).join(', ')
}
