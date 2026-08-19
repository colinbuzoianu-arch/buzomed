import { notFound, redirect } from 'next/navigation'
import { InvoiceForm } from '@/app/(authenticated)/companies/[id]/invoices/invoice-form'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { requireUser } from '@/lib/auth'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'

interface PageProps {
  params: Promise<{ id: string; iid: string }>
}

export default async function EditIntermediaryInvoicePage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) redirect('/')

  const { id: intermediaryId, iid } = await params

  const [invoice, companies] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: iid, intermediaryId, tenantId: user.tenantId, deletedAt: null },
      select: {
        status: true,
        invoiceNumber: true,
        dueDate: true,
        notes: true,
        intermediary: { select: { name: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          select: { description: true, quantity: true, unitPrice: true, companyId: true },
        },
      },
    }),
    prisma.company.findMany({
      where: { intermediaryId, tenantId: user.tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  if (!invoice?.intermediary) notFound()
  if (invoice.status !== 'draft') redirect(`/intermediaries/${intermediaryId}/invoices/${iid}`)

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: t('nav.intermediaries'), href: '/intermediaries' },
            { label: invoice.intermediary.name, href: `/intermediaries/${intermediaryId}` },
            {
              label: invoice.invoiceNumber,
              href: `/intermediaries/${intermediaryId}/invoices/${iid}`,
            },
            { label: t('common.edit') },
          ]}
        />
        <h1 className="text-3xl font-bold mt-2">{t('invoices.editPage.title')}</h1>
      </div>

      <InvoiceForm
        intermediaryId={intermediaryId}
        contracts={[]}
        lineCompanies={companies}
        submitUrl={`/api/intermediaries/${intermediaryId}/invoices/${iid}`}
        method="PATCH"
        initialItems={invoice.items.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity).toString(),
          unitPrice: Number(item.unitPrice).toString(),
          companyId: item.companyId ?? '',
        }))}
        initialDueDate={invoice.dueDate ? invoice.dueDate.toISOString().substring(0, 10) : ''}
        initialNotes={invoice.notes ?? ''}
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
          submitButton: t('invoices.form.saveButton'),
          submitting: t('invoices.form.saving'),
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
