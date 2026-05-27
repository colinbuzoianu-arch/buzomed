import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { formatDate } from '@/lib/format-date'

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function MedicalEventsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const hasReportingRole = user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )
  if (!hasReportingRole) redirect('/')

  const sp = await searchParams
  const tab = sp.tab === 'accidente' ? 'accidente' : 'toate'

  const where = {
    tenantId: user.tenantId,
    deletedAt: null,
    ...(tab === 'accidente' ? { eventType: 'workplace_accident' as const } : {}),
  }

  const events = await prisma.medicalEvent.findMany({
    where,
    orderBy: { occurredAt: 'desc' },
    take: 200,
    select: {
      id: true,
      eventType: true,
      occurredAt: true,
      description: true,
      outcome: true,
      requiresIthsReport: true,
      ithsReportFiled: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
      company: { select: { name: true } },
      practitioner: { select: { firstName: true, lastName: true } },
    },
  })

  const EVENT_TYPE_LABELS: Record<string, string> = {
    workplace_accident: t('medicalEvents.type.workplace_accident'),
    sudden_illness: t('medicalEvents.type.sudden_illness'),
    first_aid: t('medicalEvents.type.first_aid'),
    evacuation: t('medicalEvents.type.evacuation'),
    other: t('medicalEvents.type.other'),
  }

  const OUTCOME_LABELS: Record<string, string> = {
    fully_recovered: t('medicalEvents.outcome.fully_recovered'),
    partially_recovered: t('medicalEvents.outcome.partially_recovered'),
    hospitalized: t('medicalEvents.outcome.hospitalized'),
    deceased: t('medicalEvents.outcome.deceased'),
    ongoing_treatment: t('medicalEvents.outcome.ongoing_treatment'),
    other: t('medicalEvents.outcome.other'),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: t('nav.medicalEvents') }]} />
          <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight mt-2">{t('medicalEvents.title')}</h1>
        </div>
        <Link
          href="/medical-events/new"
          className="inline-flex items-center gap-1.5 h-9 rounded-md bg-primary text-primary-foreground px-3 text-sm font-medium hover:bg-primary/90 transition-colors shrink-0 mt-1"
        >
          + {t('medicalEvents.newButton')}
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 text-sm">
        <Link
          href="/medical-events?tab=toate"
          className={`px-3 py-1.5 rounded-md border ${tab === 'toate' ? 'bg-secondary font-medium' : 'hover:bg-muted'}`}
        >
          {t('medicalEvents.tabAll')}
        </Link>
        <Link
          href="/medical-events?tab=accidente"
          className={`px-3 py-1.5 rounded-md border ${tab === 'accidente' ? 'bg-secondary font-medium' : 'hover:bg-muted'}`}
        >
          {t('medicalEvents.tabAccidents')}
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('medicalEvents.empty')}</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('medicalEvents.colDate')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('medicalEvents.colEmployee')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">{t('medicalEvents.colCompany')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">{t('medicalEvents.colType')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">{t('medicalEvents.colOutcome')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('medicalEvents.colIths')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((ev) => (
                <tr key={ev.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {formatDate(ev.occurredAt, 'medium', locale === 'ro' ? 'ro' : 'en')}
                  </td>
                  <td className="px-4 py-3">
                    {ev.employee ? (
                      <Link
                        href={`/employees/${ev.employee.id}?tab=medical-events`}
                        className="font-medium hover:underline"
                      >
                        {ev.employee.lastName} {ev.employee.firstName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                    {ev.company?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    {EVENT_TYPE_LABELS[ev.eventType] ?? ev.eventType}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                    {ev.outcome ? OUTCOME_LABELS[ev.outcome] ?? ev.outcome : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {!ev.requiresIthsReport ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : ev.ithsReportFiled ? (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                        Depus
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        Necesar
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
