import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PracticeSettingsClient } from './practice-settings-client'

export const metadata = { title: 'Setări cabinet — Buzomed' }

export default async function PracticeSettingsPage() {
  const user = await requireUser()

  if (!user.tenantId || !user.roles.includes('practice_admin')) {
    redirect('/dashboard')
  }

  const [tenant, practitioners] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        id: true,
        name: true,
        legalName: true,
        cui: true,
        registrationNumber: true,
        addressLine1: true,
        phone: true,
        email: true,
        logoUrl: true,
        dataRetentionYears: true,
      },
    }),
    prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        roles: { hasSome: ['practitioner', 'practice_admin'] },
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        professionalTitle: true,
        specialty: true,
        professionalCode: true,
        stampImageUrl: true,
      },
      orderBy: { lastName: 'asc' },
    }),
  ])

  if (!tenant) redirect('/dashboard')

  return (
    <PracticeSettingsClient
      tenant={tenant}
      practitioners={practitioners}
    />
  )
}
