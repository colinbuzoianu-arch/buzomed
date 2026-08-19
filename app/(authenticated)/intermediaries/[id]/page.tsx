import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { IntermediaryDeleteButton } from '@/components/intermediaries/intermediary-delete-button'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InvoiceStatusBadge } from '@/components/ui/invoice-status-badge'
import { requireUser } from '@/lib/auth'
import { formatDate } from '@/lib/format-date'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function IntermediaryDetailPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const { id } = await params
  const intermediary = await prisma.intermediary.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    include: {
      companies: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, cui: true, city: true, isActive: true },
      },
      invoices: {
        where: { deletedAt: null },
        orderBy: [{ invoiceYear: 'desc' }, { invoiceSequence: 'desc' }],
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          issuedAt: true,
          dueDate: true,
          total: true,
          currency: true,
        },
      },
    },
  })

  if (!intermediary) {
    notFound()
  }

  const sections = [
    {
      title: t('intermediaries.form.sectionInfo'),
      rows: [
        [t('intermediaries.form.fieldName'), intermediary.name],
        [t('intermediaries.form.fieldCui'), intermediary.cui],
        [t('intermediaries.form.fieldNrRegCom'), intermediary.nrRegCom],
      ],
    },
    {
      title: t('intermediaries.form.sectionAddress'),
      rows: [
        [t('intermediaries.form.fieldAddress'), intermediary.address],
        [t('common.city'), intermediary.city],
        [t('common.county'), intermediary.county],
        [t('intermediaries.form.fieldIban'), intermediary.iban],
        [t('intermediaries.form.fieldBank'), intermediary.bank],
      ],
    },
    {
      title: t('intermediaries.form.sectionContact'),
      rows: [
        [t('intermediaries.form.fieldContactPersonName'), intermediary.contactPersonName],
        [t('intermediaries.form.fieldContactPersonEmail'), intermediary.contactPersonEmail],
        [t('intermediaries.form.fieldContactPersonPhone'), intermediary.contactPersonPhone],
      ],
    },
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: t('nav.intermediaries'), href: '/intermediaries' },
            { label: intermediary.name },
          ]}
        />
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-3xl font-bold">{intermediary.name}</h1>
            <span
              className={`mt-2 inline-flex items-center gap-1.5 text-sm ${
                intermediary.isActive ? 'text-green-700' : 'text-muted-foreground'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  intermediary.isActive ? 'bg-green-600' : 'bg-muted-foreground'
                }`}
              />
              {intermediary.isActive ? t('common.active') : t('common.inactive')}
            </span>
          </div>
          {caps.canWriteAdministrative && (
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link href={`/intermediaries/${intermediary.id}/edit`}>{t('common.edit')}</Link>
              </Button>
              <IntermediaryDeleteButton
                intermediaryId={intermediary.id}
                intermediaryName={intermediary.name}
                labels={{
                  delete: t('common.delete'),
                  deleteConfirm: t('intermediaries.deleteConfirm'),
                  deleting: t('intermediaries.deleting'),
                  errorMessage: t('intermediaries.form.errorMessage'),
                }}
              />
            </div>
          )}
        </div>
      </div>

      {sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <div className="border rounded-lg divide-y">
            {section.rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
                <div className="text-sm font-medium text-muted-foreground">{label}</div>
                <div className="md:col-span-2 text-sm whitespace-pre-wrap">
                  {value && value !== '' ? value : '—'}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {intermediary.notes && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t('intermediaries.form.sectionNotes')}</h2>
          <p className="text-sm whitespace-pre-wrap border rounded-lg px-4 py-3">
            {intermediary.notes}
          </p>
        </section>
      )}

      {/* Covered companies */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {t('intermediaries.companiesSection.title')}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            ({intermediary.companies.length})
          </span>
        </h2>
        {intermediary.companies.length === 0 ? (
          <EmptyState
            size="compact"
            illustration="companies"
            title={t('intermediaries.companiesSection.empty')}
          />
        ) : (
          <div className="border rounded-lg divide-y">
            {intermediary.companies.map((c) => (
              <Link
                key={c.id}
                href={`/companies/${c.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors"
              >
                <div>
                  <div className="text-sm font-medium">{c.name}</div>
                  {c.city && <div className="text-xs text-muted-foreground">{c.city}</div>}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">{c.cui ?? '—'}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Invoices */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {t('invoices.sectionTitle')}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({intermediary.invoices.length})
            </span>
          </h2>
          {caps.canWriteAdministrative && (
            <Button asChild size="sm">
              <Link href={`/intermediaries/${intermediary.id}/invoices/new`}>
                + {t('invoices.newButton')}
              </Link>
            </Button>
          )}
        </div>
        {intermediary.invoices.length === 0 ? (
          <EmptyState
            size="compact"
            illustration="invoices"
            title={t('invoices.emptyTitle')}
            description={t('invoices.emptyDescription')}
            primaryAction={
              caps.canWriteAdministrative
                ? {
                    label: `+ ${t('invoices.newButton')}`,
                    href: `/intermediaries/${intermediary.id}/invoices/new`,
                  }
                : undefined
            }
          />
        ) : (
          <div className="border rounded-lg divide-y">
            {intermediary.invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/intermediaries/${intermediary.id}/invoices/${inv.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors"
              >
                <div>
                  <div className="text-sm font-medium font-mono">{inv.invoiceNumber}</div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <InvoiceStatusBadge status={inv.status} />
                    <span className="text-xs text-muted-foreground">
                      {inv.issuedAt &&
                        formatDate(inv.issuedAt, 'medium', locale === 'ro' ? 'ro' : 'en')}
                      {inv.dueDate &&
                        inv.status !== 'paid' &&
                        ` · ${t('invoices.dueDate')} ${formatDate(inv.dueDate, 'medium', locale === 'ro' ? 'ro' : 'en')}`}
                    </span>
                  </div>
                </div>
                <div className="text-sm font-semibold tabular-nums text-right">
                  {Number(inv.total).toFixed(2)}{' '}
                  <span className="font-normal text-xs text-muted-foreground">{inv.currency}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
