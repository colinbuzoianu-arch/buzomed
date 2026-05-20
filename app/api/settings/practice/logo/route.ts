import { NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createServiceClient } from '@/lib/supabase/admin'

const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']
const BUCKET = 'tenant-assets'

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.roles.includes('practice_admin') || !auth.user.tenantId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const file = formData.get('logo')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Fișierul logo lipsește.' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Tip de fișier neacceptat. Folosiți PNG, JPG sau SVG.' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Fișierul depășește 2 MB.' }, { status: 400 })
  }

  // Fetch current logo URL so we can delete the old file after upload
  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.user.tenantId },
    select: { logoUrl: true },
  })
  const previousLogoUrl = tenant?.logoUrl ?? null

  const ext = file.type === 'image/svg+xml' ? 'svg' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${auth.user.tenantId}/logo-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const supabase = createServiceClient()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type })

  if (uploadError) {
    console.error('[settings/logo] Upload failed:', uploadError)
    return NextResponse.json({ error: 'Încărcarea a eșuat. Încearcă din nou.' }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const logoUrl = urlData.publicUrl

  await prisma.tenant.update({
    where: { id: auth.user.tenantId },
    data: { logoUrl },
  })

  // Delete the old file after the DB is updated so the switch is atomic
  const oldPath = previousLogoUrl?.split(`/${BUCKET}/`)[1]
  if (oldPath) {
    await supabase.storage.from(BUCKET).remove([oldPath])
  }

  return NextResponse.json({ logoUrl })
}

export async function DELETE(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.roles.includes('practice_admin') || !auth.user.tenantId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  void request

  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.user.tenantId },
    select: { logoUrl: true },
  })

  await prisma.tenant.update({
    where: { id: auth.user.tenantId },
    data: { logoUrl: null },
  })

  const oldPath = tenant?.logoUrl?.split(`/${BUCKET}/`)[1]
  if (oldPath) {
    const supabase = createServiceClient()
    await supabase.storage.from(BUCKET).remove([oldPath])
  }

  return NextResponse.json({ success: true })
}
