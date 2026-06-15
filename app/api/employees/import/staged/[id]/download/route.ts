import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { createServiceClient } from '@/lib/supabase/admin'

const BUCKET = 'import-staging'
const SIGNED_URL_EXPIRY = 120 // seconds

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void request
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await params
  const record = await prisma.importStagedFile.findFirst({
    where: { id, tenantId: auth.user.tenantId, status: 'pending' },
    select: { id: true, storagePath: true, originalFilename: true },
  })
  if (!record) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(record.storagePath, SIGNED_URL_EXPIRY)

  if (error || !data?.signedUrl) {
    console.error('[import/staged/download] signed URL failed', error)
    return NextResponse.json({ error: 'signed_url_failed' }, { status: 502 })
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    filename: record.originalFilename,
    expiresInSeconds: SIGNED_URL_EXPIRY,
  })
}
