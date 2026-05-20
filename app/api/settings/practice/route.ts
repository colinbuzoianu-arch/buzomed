import { NextRequest, NextResponse } from 'next/server'
import { getApiUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { asObject, optionalString } from '@/lib/validation'

export async function PATCH(request: NextRequest) {
  const auth = await getApiUser()
  if (!auth.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!auth.user.roles.includes('practice_admin') || !auth.user.tenantId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const body = asObject(raw) ?? {}
  const issues: string[] = []

  const name         = optionalString('name', body.name, issues, { maxLength: 200 })
  const legalName    = optionalString('legalName', body.legalName, issues, { maxLength: 200 })
  const cui          = optionalString('cui', body.cui, issues, { maxLength: 20 })
  const regCom       = optionalString('regCom', body.regCom, issues, { maxLength: 50 })
  const addressLine1 = optionalString('addressLine1', body.addressLine1, issues, { maxLength: 300 })
  const phone        = optionalString('phone', body.phone, issues, { maxLength: 50 })
  const email        = optionalString('email', body.email, issues, { maxLength: 200 })

  if (issues.length > 0) return NextResponse.json({ error: issues[0] }, { status: 400 })

  const tenant = await prisma.tenant.update({
    where: { id: auth.user.tenantId },
    data: {
      ...(name !== undefined && { name }),
      ...(legalName !== undefined && { legalName }),
      ...(cui !== undefined && { cui }),
      ...(regCom !== undefined && { registrationNumber: regCom }),
      ...(addressLine1 !== undefined && { addressLine1 }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
    },
    select: { id: true, name: true, legalName: true, cui: true, registrationNumber: true, addressLine1: true, phone: true, email: true, logoUrl: true },
  })

  return NextResponse.json({ tenant })
}
