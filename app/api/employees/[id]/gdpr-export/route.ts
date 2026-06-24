import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { writeAuditLog } from '@/lib/audit/log'

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id: employeeId } = await ctx.params

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: auth.user.tenantId, deletedAt: null },
    include: {
      company: { select: { name: true, cui: true } },
      workplaceAssignments: {
        include: { workplace: { select: { name: true, department: true } } },
        orderBy: { startDate: 'desc' },
      },
      examinations: {
        where: { deletedAt: null },
        orderBy: { completedAt: 'desc' },
        select: {
          examinationNumber: true,
          status: true,
          verdict: true,
          scheduledAt: true,
          completedAt: true,
          signedAt: true,
          examinationType: { select: { nameRo: true } },
          practitioner: { select: { firstName: true, lastName: true } },
        },
      },
      vaccinations: {
        where: { deletedAt: null },
        orderBy: { administrationDate: 'desc' },
        select: {
          vaccineName: true,
          doseNumber: true,
          administrationDate: true,
          nextDoseDueDate: true,
          manufacturer: true,
          batchNumber: true,
        },
      },
      medicalEvents: {
        where: { deletedAt: null },
        orderBy: { occurredAt: 'desc' },
        select: {
          eventType: true,
          occurredAt: true,
          description: true,
          outcome: true,
          requiresIthsReport: true,
          ithsReportFiled: true,
        },
      },
    },
  })

  if (!employee) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Documents are stored polymorphically — query separately
  const documents = await prisma.document.findMany({
    where: {
      tenantId: auth.user.tenantId,
      entityId: employeeId,
      entityType: 'employee',
      deletedAt: null,
    },
    select: {
      documentType: true,
      filename: true,
      createdAt: true,
    },
  })

  await writeAuditLog({
    tenantId: auth.user.tenantId,
    userId: auth.user.id,
    action: 'export',
    entityType: 'employee',
    entityId: employeeId,
    entitySummary: `GDPR export — ${employee.lastName} ${employee.firstName}`,
  })

  const exportData = {
    exportedAt: new Date().toISOString(),
    exportedBy: `${auth.user.firstName} ${auth.user.lastName}`,
    legalBasis: 'GDPR Art. 20 — Dreptul la portabilitatea datelor',
    employee: {
      firstName: employee.firstName,
      lastName: employee.lastName,
      birthDate: employee.birthDate?.toISOString().slice(0, 10) ?? null,
      jobTitle: employee.jobTitle,
      email: employee.email,
      phone: employee.phone,
      city: employee.city,
      bloodType: employee.bloodType,
      // CNP not included — requires a separate secure channel
      cnpNote: 'CNP criptat — disponibil la cerere separată prin canal securizat',
      company: employee.company?.name ?? null,
      workplaceHistory: employee.workplaceAssignments.map(wa => ({
        workplace: wa.workplace.name,
        department: wa.workplace.department,
        startDate: wa.startDate?.toISOString().slice(0, 10),
        endDate: wa.endDate?.toISOString().slice(0, 10),
        isCurrent: wa.isCurrent,
      })),
    },
    examinations: employee.examinations.map(e => ({
      ...e,
      scheduledAt: e.scheduledAt?.toISOString() ?? null,
      completedAt: e.completedAt?.toISOString() ?? null,
      signedAt: e.signedAt?.toISOString() ?? null,
    })),
    vaccinations: employee.vaccinations.map(v => ({
      ...v,
      administrationDate: v.administrationDate.toISOString().slice(0, 10),
      nextDoseDueDate: v.nextDoseDueDate?.toISOString().slice(0, 10) ?? null,
    })),
    medicalEvents: employee.medicalEvents.map(me => ({
      ...me,
      occurredAt: me.occurredAt.toISOString(),
    })),
    documents: documents.map(d => ({
      type: d.documentType,
      filename: d.filename,
      uploadedAt: d.createdAt.toISOString().slice(0, 10),
    })),
    dataRetentionYears: employee.dataRetentionYears ?? 'implicit cabinet',
  }

  const filename = `gdpr_${employee.lastName}_${employee.firstName}_${new Date().toISOString().slice(0, 10)}.json`
    .replace(/\s+/g, '_')
    .toLowerCase()

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
