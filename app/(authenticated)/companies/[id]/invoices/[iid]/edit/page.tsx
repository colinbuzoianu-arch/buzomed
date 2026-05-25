import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { InvoiceForm } from '../../invoice-form'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'

interface PageProps {
  params: Promise<{ id: string; iid: string }>
}

export default async function EditInvoicePage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) redirect('/')

  const { id: companyId, iid } = await params

  const [invoice, contracts] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: iid, companyId, tenantId: user.tenantId, deletedAt: null },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        company: { select: { name: true } },
      },
    }),
    prisma.contract.findMany({
      where: {
        companyId,
        tenantId: user.tenantId,
        deletedAt: null,
        status: { in: ['active', 'draft'] },
      },
      orderBy: [{ contractYear: 'desc' }, { contractSequence: 'desc' }],
      select: {
        id: true,
        contractNumber: true,
        pricePerExamination: true,
        priceMonthlyFlat: true,
      },
    }),
  ])

  if (!invoice) notFound()
  if (invoice.status !== 'draft') redirect(`/companies/${companyId}/invoices/${iid}`)

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: t('nav.companies'), href: '/companies' }, { label: invoice.company.name, href: `/companies/${companyId}` }, { label: invoice.invoiceNumber, href: `/companies/${companyId}/invoices/${iid}` }, { label: t('common.edit') }]} />
        <h1 className="text-3xl font-bold mt-2">{t('invoices.editPage.title')}</h1>
      </div>

      <InvoiceForm
        companyId={companyId}
        contracts={contracts.map((c) => ({
          id: c.id,
          contractNumber: c.contractNumber,
          pricePerExamination: c.pricePerExamination?.toString() ?? null,
          priceMonthlyFlat: c.priceMonthlyFlat?.toString() ?? null,
        }))}
        submitUrl={`/api/companies/${companyId}/invoices/${iid}`}
        method="PATCH"
        initialContractId={invoice.contractId ?? ''}
        initialItems={invoice.items.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity).toString(),
          unitPrice: Number(item.unitPrice).toString(),
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
        }}
      />
    </div>
  )
}
