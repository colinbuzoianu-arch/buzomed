import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { Button } from '@/components/ui/button'
import { CompanyDeleteButton } from './company-delete-button'
import { InvoiceStatusBadge } from '@/components/ui/invoice-status-badge'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CompanyDetailPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  // The "View report" button is only useful for users who can see
  // reports — practitioners + practice_admins. Assistants are read-only
  // and can see the company itself, but reports redirect them away.
  const hasReportingRole = user.roles.some(
    (r) => r === 'practitioner' || r === 'practice_admin'
  )

  const { id } = await params
  const company = await prisma.company.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    include: {
      workplaces: {
        where: { deletedAt: null },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          department: true,
          isActive: true,
          examinationIntervalMonths: true,
          _count: {
            select: {
              employeeAssignments: {
                where: { isCurrent: true },
              },
            },
          },
        },
      },
      contracts: {
        where: { deletedAt: null },
        orderBy: [{ contractYear: 'desc' }, { contractSequence: 'desc' }],
        select: {
          id: true,
          contractNumber: true,
          startDate: true,
          endDate: true,
          status: true,
          currency: true,
          pricePerExamination: true,
          priceMonthlyFlat: true,
        },
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

  if (!company) {
    notFound()
  }

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  const sections = [
    {
      title: t('companies.form.sectionInfo'),
      rows: [
        [t('companies.form.fieldName'), company.name],
        [t('companies.form.fieldCui'), company.cui],
        [t('companies.form.fieldRegistration'), company.registrationNumber],
        [t('companies.form.fieldCaenCode'), company.caenCode],
      ],
    },
    {
      title: t('companies.form.sectionAddress'),
      rows: [
        [t('companies.form.fieldAddress1'), company.addressLine1],
        [t('companies.form.fieldAddress2'), company.addressLine2],
        [t('common.city'), company.city],
        [t('common.county'), company.county],
        [t('common.postalCode'), company.postalCode],
        [t('common.phone'), company.phone],
        [t('common.email'), company.email],
        [t('companies.form.fieldWebsite'), company.website],
      ],
    },
    {
      title: t('companies.form.sectionContact'),
      rows: [
        [t('companies.form.fieldContactPersonName'), company.contactPersonName],
        [t('companies.form.fieldContactPersonRole'), company.contactPersonRole],
        [
          t('companies.form.fieldContactPersonPhone'),
          company.contactPersonPhone,
        ],
        [
          t('companies.form.fieldContactPersonEmail'),
          company.contactPersonEmail,
        ],
      ],
    },
    {
      title: t('companies.form.sectionContract'),
      rows: [
        [
          t('companies.form.fieldContractStart'),
          company.contractStartDate
            ? dateFormatter.format(company.contractStartDate)
            : null,
        ],
        [
          t('companies.form.fieldContractEnd'),
          company.contractEndDate
            ? dateFormatter.format(company.contractEndDate)
            : null,
        ],
        [t('companies.form.fieldNotes'), company.notes],
      ],
    },
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/companies"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('companies.backToList')}
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-3xl font-bold">{company.name}</h1>
            <span
              className={`mt-2 inline-flex items-center gap-1.5 text-sm ${
                company.isActive ? 'text-green-700' : 'text-muted-foreground'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  company.isActive ? 'bg-green-600' : 'bg-muted-foreground'
                }`}
              />
              {company.isActive ? t('common.active') : t('common.inactive')}
            </span>
          </div>
          {(hasReportingRole || caps.canWriteAdministrative) && (
            <div className="flex items-center gap-2">
              {hasReportingRole && (
                <>
                  <Button asChild variant="outline">
                    <Link href={`/companies/${company.id}/report`}>
                      {t('companies.viewReport')}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/companies/${company.id}/annual-report`}>
                      {t('companies.viewAnnualReport')}
                    </Link>
                  </Button>
                </>
              )}
              {caps.canWriteAdministrative && (
                <>
                  <Button asChild variant="outline">
                    <Link href={`/companies/${company.id}/edit`}>
                      {t('common.edit')}
                    </Link>
                  </Button>
                  <CompanyDeleteButton
                    companyId={company.id}
                    companyName={company.name}
                    labels={{
                      delete: t('common.delete'),
                      deleteConfirm: t('companies.deleteConfirm'),
                      deleting: t('companies.deleting'),
                      errorMessage: t('companies.form.errorMessage'),
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <div className="border rounded-lg divide-y">
            {section.rows.map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4 py-3"
              >
                <div className="text-sm font-medium text-muted-foreground">
                  {label}
                </div>
                <div className="md:col-span-2 text-sm whitespace-pre-wrap">
                  {value && value !== '' ? value : '—'}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Workplaces — inline section. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {t('workplaces.sectionTitle')}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({company.workplaces.length})
            </span>
          </h2>
          {caps.canWriteAdministrative && (
            <Button asChild size="sm">
              <Link href={`/companies/${company.id}/workplaces/new`}>
                + {t('workplaces.newButton')}
              </Link>
            </Button>
          )}
        </div>
        {company.workplaces.length === 0 ? (
          <div className="border border-dashed rounded-lg p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t('workplaces.empty')}
            </p>
            {caps.canWriteAdministrative && (
              <Button asChild size="sm" className="mt-3">
                <Link href={`/companies/${company.id}/workplaces/new`}>
                  + {t('workplaces.newButton')}
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {company.workplaces.map((w) => (
              <Link
                key={w.id}
                href={`/companies/${company.id}/workplaces/${w.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors"
              >
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {w.name}
                    {!w.isActive && (
                      <span className="text-xs text-muted-foreground font-normal">
                        ({t('common.inactive')})
                      </span>
                    )}
                  </div>
                  {w.department && (
                    <div className="text-xs text-muted-foreground">
                      {w.department}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  <div>
                    {t('workplaces.assignedCount').replace(
                      '{count}',
                      String(w._count.employeeAssignments)
                    )}
                  </div>
                  <div>
                    {t('workplaces.intervalShort').replace(
                      '{months}',
                      String(w.examinationIntervalMonths)
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Invoices — inline section. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {t('invoices.sectionTitle')}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({company.invoices.length})
            </span>
          </h2>
          {caps.canWriteAdministrative && (
            <Button asChild size="sm">
              <Link href={`/companies/${company.id}/invoices/new`}>
                + {t('invoices.newButton')}
              </Link>
            </Button>
          )}
        </div>
        {company.invoices.length === 0 ? (
          <div className="border border-dashed rounded-lg p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t('invoices.empty')}
            </p>
            {caps.canWriteAdministrative && (
              <Button asChild size="sm" className="mt-3">
                <Link href={`/companies/${company.id}/invoices/new`}>
                  + {t('invoices.newButton')}
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {company.invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/companies/${company.id}/invoices/${inv.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors"
              >
                <div>
                  <div className="text-sm font-medium font-mono">
                    {inv.invoiceNumber}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <InvoiceStatusBadge status={inv.status} />
                    <span className="text-xs text-muted-foreground">
                      {inv.issuedAt && dateFormatter.format(inv.issuedAt)}
                      {inv.dueDate && inv.status !== 'paid' && ` · ${t('invoices.dueDate')} ${dateFormatter.format(inv.dueDate)}`}
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

      {/* Contracts — inline section. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {t('contracts.sectionTitle')}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({company.contracts.length})
            </span>
          </h2>
          {caps.canWriteAdministrative && (
            <Button asChild size="sm">
              <Link href={`/companies/${company.id}/contracts/new`}>
                + {t('contracts.newButton')}
              </Link>
            </Button>
          )}
        </div>
        {company.contracts.length === 0 ? (
          <div className="border border-dashed rounded-lg p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t('contracts.empty')}
            </p>
            {caps.canWriteAdministrative && (
              <Button asChild size="sm" className="mt-3">
                <Link href={`/companies/${company.id}/contracts/new`}>
                  + {t('contracts.newButton')}
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {company.contracts.map((c) => {
              const statusClass =
                c.status === 'active'
                  ? 'text-green-700'
                  : c.status === 'expired' || c.status === 'terminated'
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground'
              return (
                <Link
                  key={c.id}
                  href={`/companies/${company.id}/contracts/${c.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium font-mono">
                      {c.contractNumber}
                    </div>
                    <div className={`text-xs mt-0.5 ${statusClass}`}>
                      {t(`contracts.status.${c.status}`)}
                      {' · '}
                      {dateFormatter.format(c.startDate)}
                      {c.endDate ? ` → ${dateFormatter.format(c.endDate)}` : ''}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    {c.pricePerExamination != null && (
                      <div>
                        {Number(c.pricePerExamination).toFixed(2)} {c.currency}{' '}
                        / {t('contracts.perExamination')}
                      </div>
                    )}
                    {c.priceMonthlyFlat != null && (
                      <div>
                        {Number(c.priceMonthlyFlat).toFixed(2)} {c.currency}{' '}
                        {t('contracts.monthly')}
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
