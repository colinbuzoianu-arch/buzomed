import { redirect, notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { InvoiceForm } from '../invoice-form'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function NewInvoicePage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canWriteAdministrative) redirect('/')

  const { id: companyId } = await params

  const [company, contracts] = await Promise.all([
    prisma.company.findFirst({
      where: { id: companyId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true, name: true },
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

  if (!company) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={[{ label: t('nav.companies'), href: '/companies' }, { label: company.name, href: `/companies/${companyId}` }, { label: t('invoices.newTitle') }]} />
        <h1 className="text-3xl font-bold mt-2">{t('invoices.newTitle')}</h1>
        <p className="text-muted-foreground mt-1">{company.name}</p>
      </div>

      <InvoiceForm
        companyId={companyId}
        contracts={contracts.map((c) => ({
          id: c.id,
          contractNumber: c.contractNumber,
          pricePerExamination: c.pricePerExamination?.toString() ?? null,
          priceMonthlyFlat: c.priceMonthlyFlat?.toString() ?? null,
        }))}
        submitUrl={`/api/companies/${companyId}/invoices`}
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
        }}
      />
    </div>
  )
}
