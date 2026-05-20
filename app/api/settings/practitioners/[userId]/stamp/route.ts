import { NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createServiceClient } from '@/lib/supabase/admin'

const MAX_SIZE = 2 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const BUCKET = 'tenant-assets'

interface RouteContext {
  params: Promise<{ userId: string }>
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { userId } = await ctx.params
  const isSelf = auth.user.id === userId
  const isAdmin = auth.user.roles.includes('practice_admin')

  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true, stampImageUrl: true },
  })
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const previousStampUrl = target.stampImageUrl ?? null

  const formData = await request.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const file = formData.get('stamp')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Fișierul ștampilei lipsește.' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Tip de fișier neacceptat. Folosiți PNG sau JPG.' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Fișierul depășește 2 MB.' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${auth.user.tenantId}/stamps/${userId}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const supabase = createServiceClient()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type })

  if (uploadError) {
    console.error('[settings/stamp] Upload failed:', uploadError)
    return NextResponse.json({ error: 'Încărcarea a eșuat. Încearcă din nou.' }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const stampImageUrl = urlData.publicUrl

  await prisma.user.update({
    where: { id: userId },
    data: { stampImageUrl },
  })

  // Delete the old file after the DB is updated
  const oldPath = previousStampUrl?.split(`/${BUCKET}/`)[1]
  if (oldPath) {
    await supabase.storage.from(BUCKET).remove([oldPath])
  }

  return NextResponse.json({ stampImageUrl })
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { userId } = await ctx.params
  const isSelf = auth.user.id === userId
  const isAdmin = auth.user.roles.includes('practice_admin')
  if (!isSelf && !isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  void request

  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: auth.user.tenantId, deletedAt: null },
    select: { stampImageUrl: true },
  })

  await prisma.user.update({ where: { id: userId }, data: { stampImageUrl: null } })

  const oldPath = target?.stampImageUrl?.split(`/${BUCKET}/`)[1]
  if (oldPath) {
    const supabase = createServiceClient()
    await supabase.storage.from(BUCKET).remove([oldPath])
  }

  return NextResponse.json({ success: true })
}
