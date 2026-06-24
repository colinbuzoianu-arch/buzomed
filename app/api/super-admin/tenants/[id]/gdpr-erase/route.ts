import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit/log'

interface Ctx { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user || !auth.user.roles.includes('super_admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const tenant = await prisma.tenant.findFirst({
    where: { id },
    select: { id: true, name: true },
  })
  if (!tenant) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Anonymise PII — preserve examination numbers and medical history per HG 355/2007
  const [employeeResult] = await prisma.$transaction([
    prisma.employee.updateMany({
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
    }),
    prisma.user.updateMany({
      where: { tenantId: id },
      data: {
        firstName: '[ANONIM]',
        lastName: '[ANONIM]',
        phone: null,
        cnpEncrypted: null,
        // email preserved — required for Supabase Auth
      },
    }),
    // Tenant contact data removed; name and CUI kept for fiscal audit trail
    prisma.tenant.update({
      where: { id },
      data: {
        email: null,
        phone: null,
        addressLine1: null,
        addressLine2: null,
      },
    }),
  ])

  await writeAuditLog({
    tenantId: id,
    userId: auth.user.id,
    action: 'delete',
    entityType: 'tenant',
    entityId: id,
    entitySummary: `GDPR anonimizare — ${tenant.name} — ${employeeResult.count} angajați anonimizați`,
  })

  return NextResponse.json({
    ok: true,
    anonymized: { employees: employeeResult.count },
    note: 'Datele de identificare au fost anonimizate. Istoricul medical și numerele de examinare sunt păstrate conform HG 355/2007.',
  })
}
