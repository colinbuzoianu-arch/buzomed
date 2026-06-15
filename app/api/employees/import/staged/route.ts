import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canWriteAdministrative } from '@/lib/permissions/tenant-data'

export async function GET(request: NextRequest) {
  void request
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.tenantId || !canWriteAdministrative(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const files = await prisma.importStagedFile.findMany({
    where: { tenantId: auth.user.tenantId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      originalFilename: true,
      createdAt: true,
      uploadedBy: { select: { firstName: true, lastName: true } },
    },
  })

  return NextResponse.json({
    files: files.map((f) => ({
      id: f.id,
      originalFilename: f.originalFilename,
      uploadedAt: f.createdAt,
      uploadedByName: `${f.uploadedBy.firstName} ${f.uploadedBy.lastName}`,
    })),
  })
}
