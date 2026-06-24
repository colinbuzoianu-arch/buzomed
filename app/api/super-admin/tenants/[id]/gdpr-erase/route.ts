import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/admin'

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user || !auth.user.roles.includes('super_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const tenant = await prisma.tenant.findFirst({
    where: { id },
    select: { id: true, name: true, anonymizedAt: true },
  })
  if (!tenant) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Idempotency: refuse if already erased
  if (tenant.anonymizedAt) {
    return NextResponse.json(
      { error: 'already_anonymized', anonymizedAt: tenant.anonymizedAt },
      { status: 409 }
    )
  }

  // CompanyContact has no tenantId — must resolve company IDs first
  const companies = await prisma.company.findMany({
    where: { tenantId: id },
    select: { id: true },
  })
  const companyIds = companies.map((c) => c.id)

  const now = new Date()

  const { employeeResult, userResult, contactResult, examinationResult } =
    await prisma.$transaction(async (tx) => {
      const employeeResult = await tx.employee.updateMany({
        where: { tenantId: id },
        data: {
          firstName: '[ANONIM]',
          lastName: '[ANONIM]',
          cnpEncrypted: null,
          cnpHash: null,
          birthDate: null,
          phone: null,
          email: null,
          bloodType: null,
          allergies: [],
          emergencyContactName: null,
          emergencyContactPhone: null,
          emergencyContactRelationship: null,
        },
      })

      const userResult = await tx.user.updateMany({
        where: { tenantId: id },
        data: {
          firstName: '[ANONIM]',
          lastName: '[ANONIM]',
          phone: null,
          cnpEncrypted: null,
        },
      })

      // CompanyContact has no tenantId — filter via company IDs
      const contactResult =
        companyIds.length > 0
          ? await tx.companyContact.updateMany({
              where: { companyId: { in: companyIds } },
              data: {
                name: '[ANONIM]',
                phone: null,
                email: null,
                notes: null,
              },
            })
          : { count: 0 }

      // Scrub free-text clinical fields; keep structured data per HG 355/2007
      const examinationResult = await tx.examination.updateMany({
        where: { tenantId: id },
        data: {
          anamnesis: { anonymized: true },
          clinicalFindings: null,
          recommendations: null,
          notes: null,
          verdictConditions: null,
        },
      })

      // Scrub tenant contact PII and stamp anonymisation
      await tx.tenant.update({
        where: { id },
        data: {
          email: null,
          phone: null,
          addressLine1: null,
          addressLine2: null,
          anonymizedAt: now,
          anonymizedBy: auth.user!.id,
        },
      })

      // Audit entry inside the transaction: if this fails the whole erase rolls back
      await tx.auditLogEntry.create({
        data: {
          tenantId: id,
          userId: auth.user!.id,
          action: 'delete',
          entityType: 'tenant',
          entityId: id,
          entitySummary: `GDPR anonimizare — ${tenant.name} — ${employeeResult.count} angajați, ${examinationResult.count} examinări`,
        },
      })

      return { employeeResult, userResult, contactResult, examinationResult }
    })

  // Purge storage objects — fire-and-forget; failure doesn't roll back the anonymisation
  void purgeStorageForTenant(id)

  return NextResponse.json({
    ok: true,
    anonymized: {
      employees: employeeResult.count,
      users: userResult.count,
      contacts: contactResult.count,
      examinations: examinationResult.count,
    },
    note: 'Datele de identificare au fost anonimizate. Istoricul medical și numerele de examinare sunt păstrate conform HG 355/2007.',
  })
}

async function purgeStorageForTenant(tenantId: string): Promise<void> {
  const supabase = createServiceClient()
  const BUCKETS = ['documents', 'import-staging']
  const PAGE_SIZE = 100

  for (const bucket of BUCKETS) {
    let offset = 0
    for (;;) {
      const { data: files, error } = await supabase.storage
        .from(bucket)
        .list(tenantId, { limit: PAGE_SIZE, offset })
      if (error || !files || files.length === 0) break
      const paths = files.map((f) => `${tenantId}/${f.name}`)
      await supabase.storage.from(bucket).remove(paths)
      if (files.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }
  }
}
