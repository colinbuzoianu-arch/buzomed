import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { Button } from '@/components/ui/button'
import { InvoiceStatusBadge } from '@/components/ui/invoice-status-badge'
import { requireUser } from '@/lib/auth'
import { formatDate } from '@/lib/format-date'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { prisma } from '@/lib/prisma'
import { IntermediaryInvoiceDeleteButton } from '../invoice-delete-button'

interface PageProps {
  params: Promise<{ id: string; iid: string }>
}

export default async function IntermediaryInvoiceDetailPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const { id: intermediaryId, iid } = await params

  const invoice = await prisma.invoice.findFirst({
    where: { id: iid, intermediaryId, tenantId: user.tenantId, deletedAt: null },
    include: {
      intermediary: { select: { id: true, name: true, cui: true } },
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { company: { select: { id: true, name: true } } },
      },
    },
  })

  if (!invoice?.intermediary) notFound()

  const isVatExempt = Number(invoice.vatRate) === 0

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: t('nav.intermediaries'), href: '/intermediaries' },
            { label: invoice.intermediary.name, href: `/intermediaries/${intermediaryId}` },
            { label: invoice.invoiceNumber },
          ]}
        />
        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-3xl font-bold font-mono">{invoice.invoiceNumber}</h1>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <div className="text-muted-foreground mt-1 text-sm">
              {invoice.intermediary.name}
              {invoice.intermediary.cui && ` • CUI ${invoice.intermediary.cui}`}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
              {invoice.issuedAt && (
                <span>
                  {t('invoices.issuedAt')}:{' '}
                  {formatDate(invoice.issuedAt, 'medium', locale === 'ro' ? 'ro' : 'en')}
                </span>
              )}
              {invoice.dueDate && (
                <span>
                  {t('invoices.dueDate')}:{' '}
                  {formatDate(invoice.dueDate, 'medium', locale === 'ro' ? 'ro' : 'en')}
                </span>
              )}
              {invoice.paidAt && (
                <span>
                  {t('invoices.paidAt')}:{' '}
                  {formatDate(invoice.paidAt, 'medium', locale === 'ro' ? 'ro' : 'en')}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="outline">
              <a
                href={`/api/intermediaries/${intermediaryId}/invoices/${iid}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                download
              >
                {t('invoices.actions.downloadPdf')}
              </a>
            </Button>

            {caps.canWriteAdministrative && invoice.status === 'draft' && (
              <>
                <Button asChild variant="outline">
                  <Link href={`/intermediaries/${intermediaryId}/invoices/${iid}/edit`}>
                    {t('common.edit')}
                  </Link>
                </Button>
                <IntermediaryInvoiceDeleteButton
                  intermediaryId={intermediaryId}
                  invoiceId={iid}
                  labels={{
                    delete: t('common.delete'),
                    deleteConfirm: t('invoices.actions.deleteConfirm'),
                    deleting: t('common.deleting'),
                    errorMessage: t('invoices.form.errorMessage'),
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Line items */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('invoices.form.itemsTitle')}</h2>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 w-full">{t('invoices.form.colDescription')}</th>
                <th className="text-right px-4 py-2">{t('invoices.form.colQty')}</th>
                <th className="text-right px-4 py-2 whitespace-nowrap">
                  {t('invoices.form.colUnitPrice')} ({t('invoices.currency')})
                </th>
                <th className="text-right px-4 py-2 whitespace-nowrap">
                  {t('invoices.form.colTotal')} ({t('invoices.currency')})
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    {item.description}
                    {item.company && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t('invoices.form.lineCompanyLabel')}: {item.company.name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(item.quantity).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(item.unitPrice).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {Number(item.lineTotal).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-full max-w-xs border rounded-lg divide-y text-sm">
          <div className="flex justify-between px-4 py-2">
            <span className="text-muted-foreground">{t('invoices.form.subtotalLabel')}</span>
            <span className="tabular-nums">
              {Number(invoice.subtotal).toFixed(2)} {t('invoices.currency')}
            </span>
          </div>
          <div className="flex justify-between px-4 py-2 text-xs text-muted-foreground">
            <span>
              {isVatExempt
                ? t('invoices.form.vatExemptNotice')
                : `TVA ${(Number(invoice.vatRate) * 100).toFixed(0)}%`}
            </span>
            <span className="tabular-nums">
              {Number(invoice.vatAmount).toFixed(2)} {t('invoices.currency')}
            </span>
          </div>
          <div className="flex justify-between px-4 py-2 font-semibold">
            <span>{t('invoices.form.totalLabel')}</span>
            <span className="tabular-nums">
              {Number(invoice.total).toFixed(2)} {t('invoices.currency')}
            </span>
          </div>
        </div>
      </div>

      {isVatExempt && invoice.vatExemptReason && (
        <p className="text-xs text-muted-foreground border rounded px-3 py-2 bg-muted/20">
          {invoice.vatExemptReason}
        </p>
      )}

      {invoice.notes && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t('invoices.form.notesLabel')}
          </h2>
          <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
        </section>
      )}
    </div>
  )
}
