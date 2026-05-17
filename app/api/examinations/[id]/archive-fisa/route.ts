import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteTenantData } from '@/lib/permissions/tenant-data'
import { createServiceClient } from '@/lib/supabase/admin'
import { buildStoragePath } from '@/lib/documents/upload-rules'
import { FisaPdfDocument } from '../fisa-pdf/fisa-pdf-document'

/**
 * POST /api/examinations/[id]/archive-fisa
 *
 * Generates the fișa de aptitudine PDF and saves it as a Document record
 * linked to the examination. Idempotent — if an archived fișa already
 * exists for this examination, returns it without re-generating.
 *
 * The resulting document is marked isGenerated=true and isOfficial=true,
 * so it cannot be deleted through the Documents API.
 *
 * Requires: examination must already be signed (signedAt IS NOT NULL).
 * Auth: any user with write access in the tenant.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!auth.user.tenantId || !canWriteTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id: examinationId } = await ctx.params
  const tenantId = auth.user.tenantId

  // Idempotency — return existing if already archived for this examination
  const existing = await prisma.document.findFirst({
    where: {
      tenantId,
      entityType: 'examination',
      entityId: examinationId,
      documentType: 'fisa_aptitudine',
      isGenerated: true,
      deletedAt: null,
    },
    select: { id: true, storagePath: true },
  })
  if (existing) {
    return NextResponse.json({ document: existing, alreadyExisted: true })
  }

  // Load examination with all data needed for PDF rendering
  const examination = await prisma.examination.findFirst({
    where: { id: examinationId, tenantId, deletedAt: null },
    include: {
      tenant: true,
      employee: {
        select: {
          firstName: true,
          lastName: true,
          birthDate: true,
          gender: true,
          idDocumentType: true,
        },
      },
      workplace: {
        include: { company: true },
      },
      examinationType: {
        select: { nameRo: true, code: true },
      },
      practitioner: {
        select: {
          firstName: true,
          lastName: true,
          professionalTitle: true,
          professionalCode: true,
        },
      },
      location: {
        select: {
          name: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          county: true,
        },
      },
    },
  })

  if (!examination) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (!examination.signedAt) {
    return NextResponse.json(
      { error: 'not_signed', message: 'Examination must be signed before archiving.' },
      { status: 400 }
    )
  }

  // Build PDF data (mirrors fisa-pdf/route.ts exactly)
  const data = {
    cabinetName: examination.tenant.legalName ?? examination.tenant.name,
    cabinetAddress: [
      examination.location.addressLine1,
      examination.location.addressLine2,
      examination.location.city,
      examination.location.county,
    ]
      .filter(Boolean)
      .join(', '),
    examinationNumber: examination.examinationNumber,
    examinationDate: examination.completedAt
      ? formatDateRo(examination.completedAt)
      : formatDateRo(examination.createdAt),
    signedAt: formatDateRo(examination.signedAt),
    workerName: `${examination.employee.lastName} ${examination.employee.firstName}`,
    workerBirthDate: examination.employee.birthDate
      ? formatDateRo(examination.employee.birthDate)
      : '—',
    workerGender: examination.employee.gender ?? '—',
    companyName: examination.workplace.company.name,
    companyCui: examination.workplace.company.cui ?? '—',
    workplaceName: examination.workplace.name,
    workplaceDepartment: examination.workplace.department ?? null,
    examinationTypeName: examination.examinationType.nameRo,
    verdict: examination.verdict ?? null,
    verdictConditions: examination.verdictConditions ?? null,
    nextExaminationDueDate: examination.nextExaminationDueDate
      ? formatDateRo(examination.nextExaminationDueDate)
      : '—',
    inaptUntil: examination.inaptTemporarUntil
      ? formatDateRo(examination.inaptTemporarUntil)
      : null,
    clinicalFindings: examination.clinicalFindings ?? null,
    vitalSigns: (() => {
      const vs = (examination.vitalSigns ?? {}) as Record<string, unknown>
      return {
        height: (vs.height as number) ?? null,
        weight: (vs.weight as number) ?? null,
        bmi: (vs.bmi as number) ?? null,
        bpSystolic: (vs.bpSystolic as number) ?? null,
        bpDiastolic: (vs.bpDiastolic as number) ?? null,
        pulse: (vs.pulse as number) ?? null,
      }
    })(),
    practitionerName: examination.practitioner
      ? `${examination.practitioner.lastName} ${examination.practitioner.firstName}`
      : '—',
    practitionerTitle: examination.practitioner?.professionalTitle ?? null,
    practitionerCode: examination.practitioner?.professionalCode ?? null,
    isDraft: false,
  }

  // Generate PDF
  let buffer: Uint8Array
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer = await renderToBuffer(createElement(FisaPdfDocument, data) as any)
  } catch (err) {
    console.error('[archive-fisa] pdf render failed', err)
    return NextResponse.json(
      { error: 'pdf_render_failed', message: String(err) },
      { status: 500 }
    )
  }

  // Upload to Supabase Storage
  const uniqueId = randomUUID()
  const safeNumber = examination.examinationNumber.replace('/', '-')
  const filename = `fisa_aptitudine_${safeNumber}.pdf`
  const storagePath = buildStoragePath({
    tenantId,
    entityType: 'examination',
    entityId: examinationId,
    uniqueId,
    filename,
  })

  const supabase = createServiceClient()
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadError) {
    console.error('[archive-fisa] storage upload failed', uploadError)
    return NextResponse.json(
      { error: 'storage_upload_failed', message: uploadError.message },
      { status: 500 }
    )
  }

  // Create Document record
  const doc = await prisma.document.create({
    data: {
      tenant: { connect: { id: tenantId } },
      entityType: 'examination',
      entityId: examinationId,
      documentType: 'fisa_aptitudine',
      filename,
      storagePath,
      mimeType: 'application/pdf',
      fileSizeBytes: BigInt(buffer.byteLength),
      isGenerated: true,
      isOfficial: true,
      issuedAt: examination.signedAt,
      signedBy: { connect: { id: auth.user.id } },
    },
    select: { id: true, storagePath: true },
  })

  return NextResponse.json({ document: doc, alreadyExisted: false })
}

function formatDateRo(date: Date): string {
  return new Intl.DateTimeFormat('ro-RO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}
