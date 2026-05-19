import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { InvoiceActions } from '../invoice-actions'
import { InvoiceStatusBadge } from '@/components/ui/invoice-status-badge'

interface PageProps {
  params: Promise<{ id: string; iid: string }>
}


export default async function InvoiceDetailPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const { id: companyId, iid } = await params

  const invoice = await prisma.invoice.findFirst({
    where: { id: iid, companyId, tenantId: user.tenantId, deletedAt: null },
    include: {
      company: { select: { id: true, name: true, cui: true } },
      contract: { select: { id: true, contractNumber: true } },
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!invoice) notFound()

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  const isVatExempt = Number(invoice.vatRate) === 0

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/companies/${companyId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {invoice.company.name}
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4 flex-wrap">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-3xl font-bold font-mono">{invoice.invoiceNumber}</h1>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <div className="text-muted-foreground mt-1 text-sm">
              {invoice.company.name}
              {invoice.company.cui && ` • CUI ${invoice.company.cui}`}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
              {invoice.issuedAt && (
                <span>{t('invoices.issuedAt')}: {dateFormatter.format(invoice.issuedAt)}</span>
              )}
              {invoice.dueDate && (
                <span>{t('invoices.dueDate')}: {dateFormatter.format(invoice.dueDate)}</span>
              )}
              {invoice.paidAt && (
                <span>{t('invoices.paidAt')}: {dateFormatter.format(invoice.paidAt)}</span>
              )}
              {invoice.contract && (
                <span>
                  {t('invoices.contract')}:{' '}
                  <Link
                    href={`/companies/${companyId}/contracts/${invoice.contract.id}`}
                    className="underline hover:no-underline"
                  >
                    {invoice.contract.contractNumber}
                  </Link>
                </span>
              )}
            </div>
          </div>

          {caps.canWriteAdministrative && invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
            <div className="flex items-center gap-2">
              {invoice.status === 'draft' && (
                <Button asChild variant="outline">
                  <Link href={`/companies/${companyId}/invoices/${iid}/edit`}>
                    {t('common.edit')}
                  </Link>
                </Button>
              )}
              <InvoiceActions
                companyId={companyId}
                invoiceId={iid}
                status={invoice.status}
                labels={{
                  issue: t('invoices.actions.issue'),
                  issuing: t('invoices.actions.issuing'),
                  issueConfirm: t('invoices.actions.issueConfirm'),
                  pay: t('invoices.actions.pay'),
                  paying: t('invoices.actions.paying'),
                  payConfirm: t('invoices.actions.payConfirm'),
                  cancel: t('common.delete'),
                  cancelling: t('common.deleting'),
                  cancelConfirm: t('invoices.actions.deleteConfirm'),
                  errorMessage: t('invoices.form.errorMessage'),
                }}
              />
            </div>
          )}
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
                  <td className="px-4 py-3">{item.description}</td>
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
            <span className="tabular-nums">{Number(invoice.subtotal).toFixed(2)} {t('invoices.currency')}</span>
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

      {/* VAT exemption legal basis */}
      {isVatExempt && invoice.vatExemptReason && (
        <p className="text-xs text-muted-foreground border rounded px-3 py-2 bg-muted/20">
          {invoice.vatExemptReason}
        </p>
      )}

      {/* Notes */}
      {invoice.notes && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t('invoices.form.notesLabel')}</h2>
          <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
        </section>
      )}
    </div>
  )
}
