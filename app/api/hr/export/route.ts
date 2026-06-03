import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { fetchHrExportData } from '@/lib/hr-export/fetch-data'
import { generateHrExport, type HrExportFormat } from '@/lib/hr-export/service'

const VALID_FORMATS: HrExportFormat[] = ['charisma', 'nexus', 'pluriva', 'generic']

export async function GET(req: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.roles.includes('company_hr'))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const format = req.nextUrl.searchParams.get('format') as HrExportFormat | null
  if (!format || !VALID_FORMATS.includes(format)) {
    return NextResponse.json(
      { error: 'invalid_format', valid: VALID_FORMATS },
      { status: 400 }
    )
  }

  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId_required' }, { status: 400 })
  }

  // Verify the company is one this HR user is assigned to
  const assignment = await prisma.companyHrAssignment.findFirst({
    where: { userId: auth.user.id, companyId },
    select: { tenantId: true, company: { select: { name: true } } },
  })
  if (!assignment) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const employees = await fetchHrExportData(companyId, assignment.tenantId)
  const { buffer, filename, contentType } = generateHrExport(
    employees,
    format,
    assignment.company.name
  )

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
