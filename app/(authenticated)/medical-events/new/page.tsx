import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { NewMedicalEventForm } from '@/components/employees/new-medical-event-form'

export default async function NewMedicalEventPage() {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const hasReportingRole = user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )
  if (!hasReportingRole) redirect('/')

  const employees = await prisma.employee.findMany({
    where: { tenantId: user.tenantId, deletedAt: null, archivedAt: null },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      company: { select: { name: true } },
    },
  })

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Breadcrumbs
          items={[
            { label: t('nav.medicalEvents'), href: '/medical-events' },
            { label: t('medicalEvents.newTitle') },
          ]}
        />
        <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight mt-2">
          {t('medicalEvents.newTitle')}
        </h1>
      </div>

      {employees.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nu există angajați activi. Adaugă mai întâi un angajat.
          </p>
          <Link
            href="/employees/new"
            className="mt-4 inline-flex items-center h-9 rounded-md bg-primary text-primary-foreground px-3 text-sm font-medium hover:bg-primary/90"
          >
            + Angajat nou
          </Link>
        </div>
      ) : (
        <NewMedicalEventForm employees={employees} locale={locale as 'ro' | 'en'} />
      )}
    </div>
  )
}
