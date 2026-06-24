import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { writeAuditLog } from '@/lib/audit/log'
import { fetchHrExportData } from '@/lib/hr-export/fetch-data'
import { generateHrExport, type HrExportFormat } from '@/lib/hr-export/service'

const VALID_FORMATS: HrExportFormat[] = ['charisma', 'nexus', 'pluriva', 'generic']

interface Ctx { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const hasReportingRole = auth.user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )
  if (!hasReportingRole) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const format = req.nextUrl.searchParams.get('format') as HrExportFormat | null
  if (!format || !VALID_FORMATS.includes(format)) {
    return NextResponse.json(
      { error: 'invalid_format', valid: VALID_FORMATS },
      { status: 400 }
    )
  }

  const { id } = await ctx.params
  const company = await prisma.company.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!company) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const employees = await fetchHrExportData(company.id, auth.user.tenantId)
  const { buffer, filename, contentType } = generateHrExport(employees, format, company.name)

  await writeAuditLog({
    tenantId: auth.user.tenantId,
    userId: auth.user.id,
    action: 'export',
    entityType: 'hr_export',
    entitySummary: `HR Export ${format} — ${company.name}`,
  })

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
