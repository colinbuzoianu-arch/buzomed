import { notFound, redirect } from 'next/navigation'
import { InvoiceForm } from '@/app/(authenticated)/companies/[id]/invoices/invoice-form'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function NewIntermediaryInvoicePage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) redirect('/')

  const { id: intermediaryId } = await params

  const [intermediary, companies] = await Promise.all([
    prisma.intermediary.findFirst({
      where: { id: intermediaryId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.company.findMany({
      where: { intermediaryId, tenantId: user.tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  if (!intermediary) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: t('nav.intermediaries'), href: '/intermediaries' },
            { label: intermediary.name, href: `/intermediaries/${intermediaryId}` },
            { label: t('invoices.newTitle') },
          ]}
        />
        <h1 className="text-3xl font-bold mt-2">{t('invoices.newTitle')}</h1>
        <p className="text-muted-foreground mt-1">{intermediary.name}</p>
      </div>

      <InvoiceForm
        intermediaryId={intermediaryId}
        contracts={[]}
        lineCompanies={companies}
        submitUrl={`/api/intermediaries/${intermediaryId}/invoices`}
        method="POST"
        labels={{
          contractLabel: t('invoices.form.contractLabel'),
          contractNone: t('invoices.form.contractNone'),
          itemsTitle: t('invoices.form.itemsTitle'),
          colDescription: t('invoices.form.colDescription'),
          colQty: t('invoices.form.colQty'),
          colUnitPrice: t('invoices.form.colUnitPrice'),
          colTotal: t('invoices.form.colTotal'),
          addItem: t('invoices.form.addItem'),
          removeItem: t('invoices.form.removeItem'),
          dueDateLabel: t('invoices.form.dueDateLabel'),
          notesLabel: t('invoices.form.notesLabel'),
          vatExemptNotice: t('invoices.form.vatExemptNotice'),
          subtotalLabel: t('invoices.form.subtotalLabel'),
          totalLabel: t('invoices.form.totalLabel'),
          submitButton: t('invoices.form.createButton'),
          submitting: t('invoices.form.creating'),
          cancelButton: t('common.cancel'),
          currency: t('invoices.currency'),
          errorMessage: t('invoices.form.errorMessage'),
          lineCompanyLabel: t('invoices.form.lineCompanyLabel'),
          lineCompanyNone: t('invoices.form.lineCompanyNone'),
        }}
      />
    </div>
  )
}
