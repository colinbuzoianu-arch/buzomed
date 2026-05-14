import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { FisaPdfDocument } from './fisa-pdf-document'

/**
 * GET /api/examinations/[id]/fisa-pdf
 *
 * Generates and streams a PDF version of the fișa de aptitudine.
 * Uses @react-pdf/renderer which runs entirely in Node — no
 * Chromium, no Puppeteer, works on Vercel serverless.
 *
 * The PDF is generated on the fly and not cached. Examinations that
 * are unsigned get a "DRAFT" watermark text so a printed draft is
 * visually distinguishable from the signed original.
 *
 * Accessible to anyone with read access in the tenant (same rule as
 * the HTML fișa page — the document is meant to be reprinted by staff).
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  const examination = await prisma.examination.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    include: {
      tenant: true,
      employee: {
        select: {
          id: true,
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

  // Build the data payload for the PDF component — plain serializable
  // values only, no Prisma objects.
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
      : examination.createdAt
        ? formatDateRo(examination.createdAt)
        : '—',
    signedAt: examination.signedAt ? formatDateRo(examination.signedAt) : null,

    // Worker
    workerName: `${examination.employee.lastName} ${examination.employee.firstName}`,
    workerBirthDate: examination.employee.birthDate
      ? formatDateRo(examination.employee.birthDate)
      : '—',
    workerGender: examination.employee.gender ?? '—',

    // Company / workplace
    companyName: examination.workplace.company.name,
    companyCui: examination.workplace.company.cui ?? '—',
    workplaceName: examination.workplace.name,
    workplaceDepartment: examination.workplace.department ?? null,

    // Exam type
    examinationTypeName: examination.examinationType.nameRo,

    // Clinical
    verdict: examination.verdict ?? null,
    verdictConditions: examination.verdictConditions ?? null,
    nextExaminationDueDate: examination.nextExaminationDueDate
      ? formatDateRo(examination.nextExaminationDueDate)
      : '—',
    inaptUntil: examination.inaptTemporarUntil
      ? formatDateRo(examination.inaptTemporarUntil)
      : null,
    clinicalFindings: examination.clinicalFindings ?? null,
    vitalSigns: {
      height: examination.height ?? null,
      weight: examination.weight ?? null,
      bmi: examination.bmi ?? null,
      bloodPressureSystolic: examination.bloodPressureSystolic ?? null,
      bloodPressureDiastolic: examination.bloodPressureDiastolic ?? null,
      heartRate: examination.heartRate ?? null,
    },

    // Practitioner
    practitionerName: examination.practitioner
      ? `${examination.practitioner.lastName} ${examination.practitioner.firstName}`
      : '—',
    practitionerTitle: examination.practitioner?.professionalTitle ?? null,
    practitionerCode: examination.practitioner?.professionalCode ?? null,

    isDraft: examination.signedAt === null,
  }

  let buffer: Buffer
  try {
    buffer = await renderToBuffer(createElement(FisaPdfDocument, data))
  } catch (err) {
    console.error('[fisa-pdf] render failed', err)
    return NextResponse.json(
      { error: 'pdf_render_failed', message: String(err) },
      { status: 500 }
    )
  }

  const filename = `fisa_aptitudine_${examination.examinationNumber.replace('/', '-')}.pdf`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function formatDateRo(date: Date): string {
  return new Intl.DateTimeFormat('ro-RO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}
