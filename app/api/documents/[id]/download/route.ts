import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { createServiceClient } from '@/lib/supabase/admin'

/**
 * Returns a short-lived signed URL the client can use to download the
 * actual file directly from Supabase Storage.
 *
 * Two-step pattern (permission check here, file transfer there) keeps
 * application servers out of the bandwidth path. We accept the
 * trade-off that a leaked URL is downloadable until it expires; the
 * 60-second TTL is tight enough that the realistic threat model is
 * "user accidentally pastes it into Slack," which they'd notice and
 * the URL would expire before any harm.
 *
 * POST rather than GET because:
 *   - signed URL has side effects (creates an issuance event in logs)
 *   - GET would be tempting to embed in <a> tags, which would cache
 *     the URL in browser history / referrer headers
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

const BUCKET = 'documents'
const SIGNED_URL_TTL_SECONDS = 60

export async function POST(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const document = await prisma.document.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    select: {
      id: true,
      storagePath: true,
      filename: true,
      mimeType: true,
    },
  })

  if (!document) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(document.storagePath, SIGNED_URL_TTL_SECONDS, {
      download: document.filename, // forces Content-Disposition: attachment
    })

  if (error || !data?.signedUrl) {
    console.error('[documents.download] signed URL creation failed', error)
    return NextResponse.json(
      {
        error: 'signed_url_failed',
        message: error?.message ?? 'unknown',
      },
      { status: 502 }
    )
  }

  return NextResponse.json({
    url: data.signedUrl,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    filename: document.filename,
    mimeType: document.mimeType,
  })
}
