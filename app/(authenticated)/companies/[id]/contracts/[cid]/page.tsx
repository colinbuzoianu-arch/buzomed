import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { ContractDeleteButton } from '../contract-delete-button'

interface PageProps {
  params: Promise<{ id: string; cid: string }>
}

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border',
  active: 'bg-green-50 text-green-700 border-green-300',
  expired: 'bg-yellow-50 text-yellow-700 border-yellow-300',
  terminated: 'bg-red-50 text-red-700 border-red-300',
}

export default async function ContractDetailPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const { id: companyId, cid } = await params
  const contract = await prisma.contract.findFirst({
    where: {
      id: cid,
      companyId,
      tenantId: user.tenantId,
      deletedAt: null,
    },
    include: {
      company: { select: { id: true, name: true } },
    },
  })
  if (!contract) notFound()

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  const services = Array.isArray(contract.services)
    ? (contract.services as string[])
    : []

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/companies/${contract.company.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {contract.company.name}
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-3xl font-bold font-mono">
              {contract.contractNumber}
            </h1>
            <span
              className={`mt-2 inline-flex items-center text-xs px-2 py-0.5 rounded border ${
                STATUS_CLASSES[contract.status] ?? STATUS_CLASSES.draft
              }`}
            >
              {t(`contracts.status.${contract.status}`)}
            </span>
          </div>
          {caps.canWriteAdministrative && (
            <div className="flex items-center gap-2">
              <Button asChild variant="outline">
                <Link href={`/companies/${companyId}/contracts/${cid}/edit`}>
                  {t('common.edit')}
                </Link>
              </Button>
              <ContractDeleteButton
                companyId={companyId}
                contractId={cid}
                contractNumber={contract.contractNumber}
                labels={{
                  delete: t('common.delete'),
                  deleteConfirm: t('contracts.deleteConfirm'),
                  deleting: t('contracts.deleting'),
                  errorMessage: t('contracts.form.errorMessage'),
                }}
              />
            </div>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('contracts.form.sectionDates')}</h2>
        <div className="border rounded-lg divide-y">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
            <div className="text-sm font-medium text-muted-foreground">
              {t('contracts.startDate')}
            </div>
            <div className="md:col-span-2 text-sm">
              {dateFormatter.format(contract.startDate)}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
            <div className="text-sm font-medium text-muted-foreground">
              {t('contracts.endDate')}
            </div>
            <div className="md:col-span-2 text-sm">
              {contract.endDate
                ? dateFormatter.format(contract.endDate)
                : t('contracts.openEnded')}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('contracts.form.sectionPricing')}</h2>
        <div className="border rounded-lg divide-y">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
            <div className="text-sm font-medium text-muted-foreground">
              {t('contracts.form.fieldPricePerExamination')}
            </div>
            <div className="md:col-span-2 text-sm">
              {contract.pricePerExamination != null
                ? `${Number(contract.pricePerExamination).toFixed(2)} ${contract.currency}`
                : '—'}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
            <div className="text-sm font-medium text-muted-foreground">
              {t('contracts.form.fieldPriceMonthlyFlat')}
            </div>
            <div className="md:col-span-2 text-sm">
              {contract.priceMonthlyFlat != null
                ? `${Number(contract.priceMonthlyFlat).toFixed(2)} ${contract.currency}`
                : '—'}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3">
            <div className="text-sm font-medium text-muted-foreground">
              {t('contracts.form.fieldCurrency')}
            </div>
            <div className="md:col-span-2 text-sm">{contract.currency}</div>
          </div>
        </div>
      </section>

      {services.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t('contracts.form.sectionServices')}</h2>
          <div className="border rounded-lg px-4 py-3">
            <ul className="space-y-1">
              {services.map((s, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-muted-foreground">·</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {contract.notes && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t('contracts.form.fieldNotes')}</h2>
          <div className="border rounded-lg px-4 py-3">
            <p className="text-sm whitespace-pre-wrap">{contract.notes}</p>
          </div>
        </section>
      )}
    </div>
  )
}
