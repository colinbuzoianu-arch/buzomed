import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PractitionerSettingsClient } from './practitioner-settings-client'

interface PageContext {
  params: Promise<{ userId: string }>
}

export const metadata = { title: 'Profil medic — Buzomed' }

export default async function PractitionerSettingsPage({ params }: PageContext) {
  const user = await requireUser()
  const { userId } = await params

  if (!user.tenantId) redirect('/dashboard')

  const isSelf = user.id === userId
  const isAdmin = user.roles.includes('practice_admin')
  if (!isSelf && !isAdmin) redirect('/dashboard')

  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: user.tenantId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      professionalTitle: true,
      specialty: true,
      professionalCode: true,
      stampImageUrl: true,
      signatureImageUrl: true,
    },
  })
  if (!target) notFound()

  return (
    <PractitionerSettingsClient
      practitioner={target}
      canEdit={isSelf || isAdmin}
    />
  )
}
