import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { EmployeeForm } from '../employee-form'
import { buildEmployeeFormLabels } from '../form-labels'

export default async function NewEmployeePage() {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) redirect('/employees')

  const companies = await prisma.company.findMany({
    where: { tenantId: user.tenantId, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  const labels = buildEmployeeFormLabels(t)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/employees"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('employees.backToList')}
        </Link>
        <h1 className="text-3xl font-bold mt-2">
          {t('employees.newPage.title')}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t('employees.newPage.subtitle')}
        </p>
      </div>

      <EmployeeForm
        labels={labels}
        companies={companies}
        currentCompanyId={null}
      />
    </div>
  )
}
