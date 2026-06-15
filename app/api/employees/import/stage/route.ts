import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'
import { createServiceClient } from '@/lib/supabase/admin'

const BUCKET = 'import-staging'
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // some OS/browser combos send .xlsx as this
]

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'multipart_required' }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file_required' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'file_empty' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'file_too_large', maxMb: 10 }, { status: 400 })
  }
  // Accept .csv/.xlsx/.xls regardless of MIME type reported by the client
  const ext = file.name.split('.').pop()?.toLowerCase()
  const validExt = ext === 'csv' || ext === 'xlsx' || ext === 'xls'
  const validMime = ALLOWED_TYPES.includes(file.type)
  if (!validExt && !validMime) {
    return NextResponse.json({ error: 'invalid_file_type' }, { status: 400 })
  }

  const tenantId = auth.user.tenantId
  const uuid = randomUUID()
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${tenantId}/${uuid}-${safeFilename}`

  const supabase = createServiceClient()
  const buffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type || 'application/octet-stream', upsert: false })

  if (uploadError) {
    console.error('[import/stage] storage upload failed', uploadError)
    return NextResponse.json({ error: 'storage_upload_failed', message: uploadError.message }, { status: 502 })
  }

  let record
  try {
    record = await prisma.importStagedFile.create({
      data: {
        tenantId,
        storagePath,
        originalFilename: file.name,
        uploadedByUserId: auth.user.id,
        status: 'pending',
      },
      select: {
        id: true,
        originalFilename: true,
        createdAt: true,
        uploadedBy: { select: { firstName: true, lastName: true } },
      },
    })
  } catch (err) {
    console.error('[import/stage] DB write failed; cleaning up', err)
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    return NextResponse.json({ error: 'db_write_failed' }, { status: 500 })
  }

  return NextResponse.json({
    id: record.id,
    originalFilename: record.originalFilename,
    uploadedAt: record.createdAt,
    uploadedByName: `${record.uploadedBy.firstName} ${record.uploadedBy.lastName}`,
  }, { status: 201 })
}
