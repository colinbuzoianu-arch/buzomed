import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteTenantData,
} from '@/lib/permissions/tenant-data'
import { createServiceClient } from '@/lib/supabase/admin'

/**
 * Single document operations.
 *
 *   GET    — metadata (size, MIME, uploaded-by, etc.)
 *   DELETE — soft-delete the DB row + best-effort remove the Storage
 *            object. If Storage removal fails, we still soft-delete the
 *            row and log: the row is the source of truth for "is this
 *            document still visible to users", and Storage cleanup can
 *            be done by a sweeper later.
 *
 * Generated/official documents (isGenerated=true OR isOfficial=true) are
 * NOT deletable through this endpoint — they're legal records. Returns
 * 409 instead. Sweep + restore workflows for those land later.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

const BUCKET = 'documents'

export async function GET(_request: NextRequest, ctx: RouteContext) {
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
    include: {
      uploadedBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      signedBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  })

  if (!document) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({
    document: {
      ...document,
      fileSizeBytes: Number(document.fileSizeBytes),
    },
  })
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId || !canWriteTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const document = await prisma.document.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    select: {
      id: true,
      storagePath: true,
      isGenerated: true,
      isOfficial: true,
    },
  })

  if (!document) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Refuse to delete generated/official documents. These are usually the
  // signed fișa, vaccination certificates, etc. — they need an "annul +
  // re-issue" flow, not a delete button.
  if (document.isGenerated || document.isOfficial) {
    return NextResponse.json(
      {
        error: 'cannot_delete_official',
        message:
          'This document is an official/generated record and cannot be deleted.',
      },
      { status: 409 }
    )
  }

  // Soft-delete the DB row first (this is what hides the doc from users).
  await prisma.document.update({
    where: { id: document.id },
    data: { deletedAt: new Date() },
  })

  // Best-effort: remove the Storage object. If this fails, we leave the
  // soft-deleted row pointing at the orphan and rely on a future sweep.
  // We don't want to undo the soft-delete just because Storage hiccupped.
  const supabase = createServiceClient()
  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove([document.storagePath])
  if (removeError) {
    console.error(
      '[documents.delete] storage remove failed (row still soft-deleted)',
      { path: document.storagePath, error: removeError.message }
    )
  }

  return NextResponse.json({ ok: true })
}
