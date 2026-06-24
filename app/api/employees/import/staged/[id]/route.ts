import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { createServiceClient } from '@/lib/supabase/admin'

const BUCKET = 'import-staging'

export async function DELETE(
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
    where: { id, tenantId: auth.user.tenantId },
    select: { id: true, storagePath: true, status: true },
  })
  if (!record) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await prisma.importStagedFile.update({
    where: { id: record.id },
    data: { status: 'discarded' },
  })

  const supabase = createServiceClient()
  await supabase.storage.from(BUCKET).remove([record.storagePath]).catch((err) => {
    console.error('[import/staged] storage remove failed (non-fatal)', err)
  })

  return NextResponse.json({ success: true })
}
