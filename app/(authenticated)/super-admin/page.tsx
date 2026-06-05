import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { DemoInviteButton } from './demo-invite-button'
import { ProbeInviteButton } from './probe-invite-button'
import { EnterpriseInviteButton } from './enterprise-invite-button'
import { RecallNotificationsButton } from './recall-notifications-button'
import { RetentionCheckButton } from '@/components/super-admin/retention-check-button'
import { formatDate } from '@/lib/format-date'

/**
 * Super-admin index — tenant list with activity metrics and sorting.
 *
 * Sort options via ?sort= query param:
 *   name        — alphabetical A→Z
 *   created     — newest first (default)
 *   lastActive  — most recently active tenant first
 *   examinations — highest exam count first
 *   status      — active first, then trial, then others
 *
 * Each tenant row shows:
 *   - Name + demo badge
 *   - City
 *   - Subscription tier/status
 *   - User count
 *   - Examination count (all time)
 *   - Last active (latest lastLoginAt across all users in the tenant)
 *   - Created at
 */

type SortKey = 'name' | 'created' | 'lastActive' | 'examinations' | 'status'

const VALID_SORTS: SortKey[] = ['name', 'created', 'lastActive', 'examinations', 'status']

interface PageProps {
  searchParams: Promise<{ sort?: string }>
}

export default async function SuperAdminPage({ searchParams }: PageProps) {
  await requireRole('super_admin')
  const locale = await getLocale()
  const t = getTranslator(locale)

  const params = await searchParams
  const sort: SortKey =
    params.sort && (VALID_SORTS as string[]).includes(params.sort)
      ? (params.sort as SortKey)
      : 'created'

  // Pull tenants with aggregated activity counts
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    include: {
      users: {
        where: { deletedAt: null },
        select: { id: true, lastLoginAt: true, isActive: true },
      },
      _count: {
        select: {
          examinations: { where: { deletedAt: null } },
          employees: { where: { deletedAt: null, archivedAt: null } },
          companies: { where: { deletedAt: null } },
        },
      },
    },
  })

  // Compute derived values for sorting and display
  const enriched = tenants.map((t) => {
    const activeUsers = t.users.filter((u) => u.isActive && u.lastLoginAt !== null)
    const lastActive = activeUsers.reduce<Date | null>((best, u) => {
      if (!u.lastLoginAt) return best
      return best === null || u.lastLoginAt > best ? u.lastLoginAt : best
    }, null)
    return {
      ...t,
      lastActive,
      userCount: t.users.filter((u) => u.isActive).length,
      examinationCount: t._count.examinations,
      employeeCount: t._count.employees,
      companyCount: t._count.companies,
    }
  })

  // Sort
  const sorted = [...enriched].sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name, 'ro')
      case 'created':
        return b.createdAt.getTime() - a.createdAt.getTime()
      case 'lastActive': {
        const aTime = a.lastActive?.getTime() ?? 0
        const bTime = b.lastActive?.getTime() ?? 0
        return bTime - aTime
      }
      case 'examinations':
        return b.examinationCount - a.examinationCount
      case 'status': {
        const rank = (s: string) =>
          s === 'active' ? 0 : s === 'trial' ? 1 : 2
        return rank(a.subscriptionStatus) - rank(b.subscriptionStatus)
      }
    }
  })

  // Global stats for header
  const totalTenants = tenants.length
  const activeTenants = tenants.filter(
    (t) => t.subscriptionStatus === 'active'
  ).length
  const demoTenants = tenants.filter((t) => t.isDemo).length
  const totalExaminations = enriched.reduce((s, t) => s + t.examinationCount, 0)

  // Subscription stats from the new Subscription model
  const allSubs = await prisma.subscription.findMany({
    where: { tenant: { deletedAt: null } },
    select: { status: true, plan: { select: { monthlyPrice: true } } },
  })

  const subsByStatus = allSubs.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1
    return acc
  }, {})

  const mrr = allSubs
    .filter((s) => s.status === 'active' && s.plan?.monthlyPrice)
    .reduce((sum, s) => sum + Number(s.plan!.monthlyPrice), 0)

  const trialExpiredCount = subsByStatus['trial_expired'] ?? 0
  const activeCount = subsByStatus['active'] ?? 0
  const conversionRate = trialExpiredCount + activeCount > 0
    ? Math.round((activeCount / (trialExpiredCount + activeCount)) * 100)
    : 0

  const subscriptionStats = {
    trialActive: subsByStatus['trial_active'] ?? 0,
    trialExpired: trialExpiredCount,
    active: activeCount,
    comp: subsByStatus['comp'] ?? 0,
    mrr,
    conversionRate,
  }

  // Billing stats
  const billingRows = await prisma.platformInvoice.groupBy({
    by: ['status'],
    where: { deletedAt: null },
    _count: { id: true },
    _sum: { total: true },
  })
  const byStatus = Object.fromEntries(
    billingRows.map((r) => [r.status, { count: r._count.id, sum: Number(r._sum.total ?? 0) }])
  )
  const billingStats = {
    issued:        byStatus.issued?.count ?? 0,
    totalUnpaid:   Math.round((byStatus.issued?.sum ?? 0) + (byStatus.overdue?.sum ?? 0)),
    paidThisMonth: byStatus.paid?.count ?? 0,
    overdue:       byStatus.overdue?.count ?? 0,
  }

  function SortLink({
    sortKey,
    label,
  }: {
    sortKey: SortKey
    label: string
  }) {
    const isActive = sort === sortKey
    return (
      <Link
        href={`/super-admin?sort=${sortKey}`}
        className={`flex items-center gap-1 hover:text-foreground transition-colors ${
          isActive ? 'text-foreground font-semibold' : 'text-muted-foreground'
        }`}
      >
        {label}
        {isActive && <span className="text-xs">↓</span>}
      </Link>
    )
  }

  const probeInviteLabels = {
    buttonLabel: t('superAdmin.probeInvite.button'),
    dialogTitle: t('superAdmin.probeInvite.dialogTitle'),
    dialogDescription: t('superAdmin.probeInvite.dialogDescription'),
    fieldEmail: t('common.email'),
    fieldFirstName: t('superAdmin.probeInvite.fieldFirstName'),
    fieldLastName: t('superAdmin.probeInvite.fieldLastName'),
    fieldCabinetName: t('superAdmin.probeInvite.fieldCabinetName'),
    fieldCabinetNameHelp: t('superAdmin.probeInvite.fieldCabinetNameHelp'),
    fieldLocale: t('superAdmin.probeInvite.fieldLocale'),
    submit: t('superAdmin.probeInvite.submit'),
    submitting: t('superAdmin.probeInvite.submitting'),
    successMessage: t('superAdmin.probeInvite.successMessage'),
    errorMessage: t('superAdmin.probeInvite.errorMessage'),
    errorEmailExists: t('superAdmin.probeInvite.errorEmailExists'),
    cancel: t('common.cancel'),
  }

  const enterpriseInviteLabels = {
    buttonLabel: t('superAdmin.enterpriseInvite.button'),
    dialogTitle: t('superAdmin.enterpriseInvite.dialogTitle'),
    dialogDescription: t('superAdmin.enterpriseInvite.dialogDescription'),
    fieldEmail: t('common.email'),
    fieldFirstName: t('superAdmin.enterpriseInvite.fieldFirstName'),
    fieldLastName: t('superAdmin.enterpriseInvite.fieldLastName'),
    fieldCabinetName: t('superAdmin.enterpriseInvite.fieldCabinetName'),
    fieldCabinetNameHelp: t('superAdmin.enterpriseInvite.fieldCabinetNameHelp'),
    fieldLocale: t('superAdmin.enterpriseInvite.fieldLocale'),
    fieldNotes: t('superAdmin.enterpriseInvite.fieldNotes'),
    fieldNotesPlaceholder: t('superAdmin.enterpriseInvite.fieldNotesPlaceholder'),
    submit: t('superAdmin.enterpriseInvite.submit'),
    submitting: t('superAdmin.enterpriseInvite.submitting'),
    successMessage: t('superAdmin.enterpriseInvite.successMessage'),
    errorMessage: t('superAdmin.enterpriseInvite.errorMessage'),
    errorEmailExists: t('superAdmin.enterpriseInvite.errorEmailExists'),
    cancel: t('common.cancel'),
  }

  const demoInviteLabels = {
    buttonLabel: t('superAdmin.demoInvite.button'),
    dialogTitle: t('superAdmin.demoInvite.dialogTitle'),
    dialogDescription: t('superAdmin.demoInvite.dialogDescription'),
    fieldEmail: t('common.email'),
    fieldFirstName: t('superAdmin.demoInvite.fieldFirstName'),
    fieldLastName: t('superAdmin.demoInvite.fieldLastName'),
    fieldCabinetName: t('superAdmin.demoInvite.fieldCabinetName'),
    fieldCabinetNameHelp: t('superAdmin.demoInvite.fieldCabinetNameHelp'),
    fieldLocale: t('superAdmin.demoInvite.fieldLocale'),
    submit: t('superAdmin.demoInvite.submit'),
    submitting: t('superAdmin.demoInvite.submitting'),
    successMessage: t('superAdmin.demoInvite.successMessage'),
    errorMessage: t('superAdmin.demoInvite.errorMessage'),
    errorEmailExists: t('superAdmin.demoInvite.errorEmailExists'),
    cancel: t('common.cancel'),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t('superAdmin.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('superAdmin.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <RecallNotificationsButton />
          <ProbeInviteButton labels={probeInviteLabels} />
          <EnterpriseInviteButton labels={enterpriseInviteLabels} />
          <DemoInviteButton labels={demoInviteLabels} />
          <Button asChild>
            <Link href="/super-admin/tenants/new">
              + {t('superAdmin.createTenant')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Global stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={t('superAdmin.stats.totalTenants')} value={totalTenants} />
        <StatCard label={t('superAdmin.stats.activeTenants')} value={activeTenants} tone="success" />
        <StatCard label={t('superAdmin.stats.demoTenants')} value={demoTenants} />
        <StatCard label={t('superAdmin.stats.totalExaminations')} value={totalExaminations} />
      </div>

      {/* Subscription stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Trial activ" value={subscriptionStats.trialActive} />
        <StatCard label="Trial expirat" value={subscriptionStats.trialExpired} />
        <StatCard label="Activ (plătit)" value={subscriptionStats.active} tone="success" />
        <StatCard label="Comp / Enterprise" value={subscriptionStats.comp} />
        <StatCard label="MRR (RON)" value={Math.round(subscriptionStats.mrr)} tone="success" />
        <StatCard label="Conversie %" value={subscriptionStats.conversionRate} />
      </div>

      {/* Billing overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Facturi emise" value={billingStats.issued} />
        <StatCard label="De încasat (RON)" value={billingStats.totalUnpaid} />
        <StatCard label="Plătite" value={billingStats.paidThisMonth} tone="success" />
        <StatCard label="Restanțe" value={billingStats.overdue} />
      </div>

      {/* GDPR — Data retention check */}
      <section className="rounded-lg border bg-card p-6 space-y-3">
        <div>
          <h2 className="text-[13px] font-medium text-foreground">
            Verificare retenție date (GDPR Art. 5)
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1">
            Identifică cabinete cu date medicale care depășesc perioada de retenție configurată.
            Ștergerea rămâne manuală și necesită confirmare explicită.
          </p>
        </div>
        <RetentionCheckButton />
      </section>

      {/* Registrations — invite-only */}
      <section className="rounded-lg border bg-card p-6 space-y-2">
        <h2 className="text-[13px] font-medium text-foreground">
          Înregistrări publice
        </h2>
        <p className="text-[12px] text-[hsl(var(--text-muted))]">
          Înregistrarea publică este dezactivată. Cabinetele noi se creează din{' '}
          <Link href="/super-admin/tenants/new" className="text-primary hover:underline underline-offset-2">
            Super Admin → Cabinet nou
          </Link>.
        </p>
      </section>

      {sorted.length === 0 ? (
        <EmptyState
          illustration="generic"
          title={t('superAdmin.emptyTitle')}
          description={t('superAdmin.emptyDescription')}
          primaryAction={{ label: t('superAdmin.createTenant'), href: '/super-admin/tenants/new' }}
        />
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/30 text-xs tracking-wide border-b">
              <tr>
                <th className="text-left px-4 py-3">
                  <SortLink sortKey="name" label={t('superAdmin.tenantsTable.name')} />
                </th>
                <th className="text-left px-4 py-3 text-muted-foreground">
                  {t('superAdmin.tenantsTable.city')}
                </th>
                <th className="text-left px-4 py-3">
                  <SortLink sortKey="status" label={t('superAdmin.tenantsTable.subscription')} />
                </th>
                <th className="text-right px-4 py-3 text-muted-foreground">
                  {t('superAdmin.tenantsTable.users')}
                </th>
                <th className="text-right px-4 py-3">
                  <SortLink sortKey="examinations" label={t('superAdmin.tenantsTable.examinations')} />
                </th>
                <th className="text-right px-4 py-3 text-muted-foreground">
                  {t('superAdmin.tenantsTable.employees')}
                </th>
                <th className="text-left px-4 py-3">
                  <SortLink sortKey="lastActive" label={t('superAdmin.tenantsTable.lastActive')} />
                </th>
                <th className="text-left px-4 py-3">
                  <SortLink sortKey="created" label={t('common.createdAt')} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((tenant) => (
                <tr
                  key={tenant.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/super-admin/tenants/${tenant.id}`}
                      className="font-medium hover:underline flex items-center gap-2"
                    >
                      {tenant.name}
                      {tenant.isDemo && (
                        <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-950 dark:text-violet-300">
                          demo
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {tenant.city || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-sm ${
                        tenant.subscriptionStatus === 'active'
                          ? 'text-green-700'
                          : 'text-muted-foreground'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          tenant.subscriptionStatus === 'active'
                            ? 'bg-green-600'
                            : 'bg-gray-400'
                        }`}
                      />
                      {t(`superAdmin.subscription.${tenant.subscriptionTier}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {tenant.userCount}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {tenant.examinationCount > 0 ? tenant.examinationCount : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {tenant.employeeCount}
                  </td>
                  <td className="px-4 py-3">
                    {tenant.lastActive ? (
                      <span
                        className={`text-sm ${
                          tenant.lastActive > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                            ? 'text-green-700'
                            : tenant.lastActive > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {formatDate(tenant.lastActive, 'medium', locale === 'ro' ? 'ro' : 'en')}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        {t('superAdmin.tenantsTable.neverActive')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-sm">
                    {formatDate(tenant.createdAt, 'medium', locale === 'ro' ? 'ro' : 'en')}
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

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'success'
}) {
  return (
    <div className="border rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`text-2xl font-bold mt-1 ${
          tone === 'success' ? 'text-green-700' : ''
        }`}
      >
        {value}
      </div>
    </div>
  )
}
