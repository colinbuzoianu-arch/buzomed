import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { BulkScheduleWizard } from './bulk-schedule-wizard'

interface PageProps {
  searchParams: Promise<{ companyId?: string }>
}

export default async function BulkSchedulePage({ searchParams }: PageProps) {
  const user = await requireUser()
  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')
  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) redirect('/examinations')

  const sp = await searchParams
  return <BulkScheduleWizard initialCompanyId={sp.companyId ?? null} />
}
