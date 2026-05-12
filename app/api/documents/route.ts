import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { DocumentEntityType, DocumentType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import {
  canReadTenantData,
  canWriteTenantData,
} from '@/lib/permissions/tenant-data'
import { createServiceClient } from '@/lib/supabase/admin'
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  buildStoragePath,
  describeAllowed,
  formatFileSize,
  isAllowedMime,
} from '@/lib/documents/upload-rules'

/**
 * Documents are polymorphic — each row is owned by one entity (an
 * examination, an employee, a workplace, etc.). The list endpoint takes
 * entityType + entityId as query parameters and returns documents
 * attached to that specific entity.
 *
 * For session 7 we expose the API for all DocumentEntityType values, but
 * the UI only surfaces 'examination' and 'employee'. Adding 'company' or
 * 'workplace' later just means dropping the same component onto those
 * detail pages.
 *
 * Upload mode: server-side multipart. The client posts the file directly
 * to this endpoint; we validate, upload to Supabase Storage with the
 * service-role key, then write a Document row. Two-step (signed upload
 * URL + finalize) was considered and rejected — see README.md.
 */

const VALID_ENTITY_TYPES: DocumentEntityType[] = [
  'examination',
  'employee',
  'workplace',
  'company',
  'vaccination',
  'medical_event',
]

const VALID_DOCUMENT_TYPES: DocumentType[] = [
  'fisa_aptitudine',
  'fisa_factori_risc',
  'dosarul_medical',
  'raport_medical',
  'adeverinta_medicala',
  'vaccination_certificate',
  'lab_result',
  'referral',
  'external_document',
  'other',
]

const BUCKET = 'documents'

// ─── GET — list documents for an entity ─────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 403 })
  }
  if (!canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const entityType = searchParams.get('entityType') as DocumentEntityType | null
  const entityId = searchParams.get('entityId')

  if (!entityType || !VALID_ENTITY_TYPES.includes(entityType)) {
    return NextResponse.json(
      { error: 'invalid_entity_type' },
      { status: 400 }
    )
  }
  if (!entityId) {
    return NextResponse.json({ error: 'entity_id_required' }, { status: 400 })
  }

  // Defensive: verify the entity exists in this tenant before listing.
  // Without this, a malicious client could probe document existence
  // across entity types by trying entityIds.
  const exists = await entityExistsInTenant(
    entityType,
    entityId,
    auth.user.tenantId
  )
  if (!exists) {
    return NextResponse.json({ error: 'entity_not_found' }, { status: 404 })
  }

  const documents = await prisma.document.findMany({
    where: {
      tenantId: auth.user.tenantId,
      entityType,
      entityId,
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
    include: {
      uploadedBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  })

  // BigInt is not JSON-serializable; coerce to number (file sizes are ≤15 MB
  // so a JS number is safe — well below 2^53).
  return NextResponse.json({
    documents: documents.map((d) => ({
      ...d,
      fileSizeBytes: Number(d.fileSizeBytes),
    })),
  })
}

// ─── POST — upload a new document ──────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json(
      { error: 'unauthorized', reason: auth.reason },
      { status: 401 }
    )
  }
  if (!auth.user.tenantId) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 403 })
  }
  if (!canWriteTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Expect multipart/form-data. JSON-only clients should not hit this
  // endpoint; refuse instead of trying to be clever.
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return NextResponse.json(
      {
        error: 'invalid_content_type',
        message: 'Upload requires multipart/form-data',
      },
      { status: 400 }
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    console.error('formData parse failed', err)
    return NextResponse.json(
      { error: 'invalid_form_data' },
      { status: 400 }
    )
  }

  const file = formData.get('file')
  const entityType = formData.get('entityType') as DocumentEntityType | null
  const entityId = formData.get('entityId') as string | null
  const documentType = formData.get('documentType') as DocumentType | null

  const issues: string[] = []
  if (!entityType || !VALID_ENTITY_TYPES.includes(entityType)) {
    issues.push('entityType is required and must be a known entity type')
  }
  if (!entityId || typeof entityId !== 'string') {
    issues.push('entityId is required')
  }
  if (!documentType || !VALID_DOCUMENT_TYPES.includes(documentType)) {
    issues.push('documentType is required and must be a known document type')
  }
  if (!file || !(file instanceof File)) {
    issues.push('file is required (multipart "file" field)')
  } else {
    if (file.size === 0) {
      issues.push('file is empty')
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      issues.push(
        `file is too large (${formatFileSize(file.size)}). Max is ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`
      )
    }
    if (!isAllowedMime(file.type)) {
      issues.push(
        `file type "${file.type || 'unknown'}" is not allowed. Allowed: ${describeAllowed()}.`
      )
    }
  }

  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'validation_failed', issues },
      { status: 400 }
    )
  }

  // Past validation we know the casts are safe.
  const validatedFile = file as File
  const validatedEntityType = entityType as DocumentEntityType
  const validatedEntityId = entityId as string
  const validatedDocumentType = documentType as DocumentType

  // Verify the target entity exists in this tenant.
  const entityOk = await entityExistsInTenant(
    validatedEntityType,
    validatedEntityId,
    auth.user.tenantId
  )
  if (!entityOk) {
    return NextResponse.json({ error: 'entity_not_found' }, { status: 404 })
  }

  // Upload to Supabase Storage.
  const uniqueId = randomUUID()
  const storagePath = buildStoragePath({
    tenantId: auth.user.tenantId,
    entityType: validatedEntityType,
    entityId: validatedEntityId,
    uniqueId,
    filename: validatedFile.name,
  })

  const supabase = createServiceClient()
  const arrayBuffer = await validatedFile.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: validatedFile.type,
      upsert: false,
    })

  if (uploadError) {
    console.error('[documents.upload] storage upload failed', uploadError)
    return NextResponse.json(
      {
        error: 'storage_upload_failed',
        message: uploadError.message,
      },
      { status: 502 }
    )
  }

  // Write the DB row. If this fails, the Storage object is orphaned —
  // we attempt to clean it up.
  let created
  try {
    created = await prisma.document.create({
      data: {
        tenant: { connect: { id: auth.user.tenantId } },
        entityType: validatedEntityType,
        entityId: validatedEntityId,
        documentType: validatedDocumentType,
        filename: validatedFile.name,
        storagePath,
        mimeType: validatedFile.type,
        fileSizeBytes: BigInt(validatedFile.size),
        isGenerated: false,
        uploadedBy: { connect: { id: auth.user.id } },
      } satisfies Prisma.DocumentCreateInput,
    })
  } catch (err) {
    console.error('[documents.upload] DB write failed; cleaning up object', err)
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    return NextResponse.json(
      { error: 'db_write_failed' },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      document: {
        ...created,
        fileSizeBytes: Number(created.fileSizeBytes),
      },
    },
    { status: 201 }
  )
}

// ─── helpers ────────────────────────────────────────────────────────

/**
 * Confirms that the given (entityType, entityId) actually exists within
 * the given tenant and is not soft-deleted (where applicable). Returns
 * false if missing, archived/deleted, or in another tenant.
 *
 * This is the primary tenant-isolation gate for the documents API —
 * without it, a user could attach a document to entityId 'xxx-yyy'
 * whether or not it's something they can see.
 */
async function entityExistsInTenant(
  entityType: DocumentEntityType,
  entityId: string,
  tenantId: string
): Promise<boolean> {
  switch (entityType) {
    case 'examination': {
      const row = await prisma.examination.findFirst({
        where: { id: entityId, tenantId, deletedAt: null },
        select: { id: true },
      })
      return row !== null
    }
    case 'employee': {
      const row = await prisma.employee.findFirst({
        where: { id: entityId, tenantId, deletedAt: null },
        select: { id: true },
      })
      return row !== null
    }
    case 'workplace': {
      const row = await prisma.workplace.findFirst({
        where: { id: entityId, tenantId, deletedAt: null },
        select: { id: true },
      })
      return row !== null
    }
    case 'company': {
      const row = await prisma.company.findFirst({
        where: { id: entityId, tenantId, deletedAt: null },
        select: { id: true },
      })
      return row !== null
    }
    // Vaccination + medical_event aren't surfaced in the UI yet but the
    // API accepts them — return false for now since the tables either
    // don't have data or don't have a tenantId-filtered finder we want
    // to wire up before session 9/10. Calling the API with these
    // entityTypes will get a 404 until the corresponding feature lands.
    case 'vaccination':
    case 'medical_event':
      return false
    default: {
      // Exhaustiveness check — if a new DocumentEntityType is added to
      // the schema, TypeScript will surface it here as a type error
      // rather than us silently returning undefined.
      const _exhaustive: never = entityType
      void _exhaustive
      return false
    }
  }
}
