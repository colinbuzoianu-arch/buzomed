import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TenantInviteSection } from './tenant-invite-section'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TenantDetailPage({ params }: PageProps) {
  await requireRole('super_admin')
  const { id } = await params
  const locale = await getLocale()
  const t = getTranslator(locale)

  const tenant = await prisma.tenant.findFirst({
    where: { id, deletedAt: null },
    include: {
      users: {
        where: { deletedAt: null },
        orderBy: [{ isActive: 'desc' }, { lastLoginAt: 'desc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          roles: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          authUserId: true,
        },
      },
    },
  })

  if (!tenant) notFound()

  // Activity metrics
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalExaminations,
    examsThisMonth,
    examsThisWeek,
    signedThisMonth,
    totalEmployees,
    totalCompanies,
    overdueRecalls,
    pendingRecalls,
  ] = await Promise.all([
    prisma.examination.count({
      where: { tenantId: tenant.id, deletedAt: null },
    }),
    prisma.examination.count({
      where: { tenantId: tenant.id, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.examination.count({
      where: { tenantId: tenant.id, deletedAt: null, createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.examination.count({
      where: { tenantId: tenant.id, deletedAt: null, signedAt: { gte: thirtyDaysAgo } },
    }),
    prisma.employee.count({
      where: { tenantId: tenant.id, deletedAt: null, archivedAt: null },
    }),
    prisma.company.count({
      where: { tenantId: tenant.id, deletedAt: null },
    }),
    prisma.recall.count({
      where: { tenantId: tenant.id, deletedAt: null, status: 'overdue' },
    }),
    prisma.recall.count({
      where: { tenantId: tenant.id, deletedAt: null, status: 'pending' },
    }),
  ])

  const lastActive = tenant.users.reduce<Date | null>((best, u) => {
    if (!u.lastLoginAt) return best
    return best === null || u.lastLoginAt > best ? u.lastLoginAt : best
  }, null)

  const now = new Date()
  const pendingInvitations = await prisma.invitation.findMany({
    where: {
      tenantId: tenant.id,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      invitedBy: { select: { firstName: true, lastName: true } },
    },
  })

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  const dateTimeFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium', timeStyle: 'short' }
  )

  const inviteLabels = {
    sectionTitle: t('tenantDetail.invitations.sectionTitle'),
    inviteButton: t('tenantDetail.invitations.inviteButton'),
    noPending: t('tenantDetail.invitations.noPending'),
    columnEmail: t('common.email'),
    columnRole: t('tenantDetail.invitations.columnRole'),
    columnInvitedBy: t('tenantDetail.invitations.columnInvitedBy'),
    columnExpiresAt: t('tenantDetail.invitations.columnExpiresAt'),
    columnActions: t('common.actions'),
    revokeAction: t('tenantDetail.invitations.revoke'),
    revokeConfirm: t('tenantDetail.invitations.revokeConfirm'),
    dialogTitle: t('tenantDetail.invitations.dialogTitle'),
    dialogDescription: t('tenantDetail.invitations.dialogDescription'),
    fieldEmail: t('tenantDetail.invitations.fieldEmail'),
    fieldEmailPlaceholder: t('tenantDetail.invitations.fieldEmailPlaceholder'),
    fieldName: t('tenantDetail.invitations.fieldName'),
    fieldNamePlaceholder: t('tenantDetail.invitations.fieldNamePlaceholder'),
    fieldNameOptional: t('tenantDetail.invitations.fieldNameOptional'),
    fieldRole: t('tenantDetail.invitations.fieldRole'),
    sendInvite: t('tenantDetail.invitations.sendInvite'),
    sending: t('tenantDetail.invitations.sending'),
    cancel: t('common.cancel'),
    successMessage: t('tenantDetail.invitations.successMessage'),
    errorMessage: t('tenantDetail.invitations.errorMessage'),
    errorAlreadyActive: t('tenantDetail.invitations.errorAlreadyActive'),
    errorInvalidEmail: t('tenantDetail.invitations.errorInvalidEmail'),
    rolePracticeAdmin: t('tenantDetail.invitations.rolePracticeAdmin'),
    locale,
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/super-admin" className="hover:text-foreground transition-colors">
          ← {t('common.back')}
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            {tenant.name}
            {tenant.isDemo && (
              <span className="inline-block px-2 py-0.5 text-sm rounded bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-950 dark:text-violet-300">
                demo
              </span>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">
            {tenant.legalName || tenant.slug}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-sm text-muted-foreground">
            {t(`superAdmin.subscription.${tenant.subscriptionTier}`)}
          </span>
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
            {tenant.subscriptionStatus}
          </span>
        </div>
      </div>

      {/* Activity dashboard */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t('tenantDetail.activityTitle')}</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ActivityCard
            label={t('tenantDetail.activity.totalExams')}
            value={String(totalExaminations)}
          />
          <ActivityCard
            label={t('tenantDetail.activity.examsThisMonth')}
            value={String(examsThisMonth)}
            sub={`${examsThisWeek} ${t('tenantDetail.activity.thisWeek')}`}
          />
          <ActivityCard
            label={t('tenantDetail.activity.signedThisMonth')}
            value={String(signedThisMonth)}
          />
          <ActivityCard
            label={t('tenantDetail.activity.overdueRecalls')}
            value={String(overdueRecalls)}
            tone={overdueRecalls > 0 ? 'destructive' : 'default'}
            sub={`${pendingRecalls} ${t('tenantDetail.activity.pending')}`}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <ActivityCard
            label={t('tenantDetail.activity.employees')}
            value={String(totalEmployees)}
          />
          <ActivityCard
            label={t('tenantDetail.activity.companies')}
            value={String(totalCompanies)}
          />
          <ActivityCard
            label={t('tenantDetail.activity.lastActive')}
            value={lastActive ? dateTimeFormatter.format(lastActive) : '—'}
            tone={
              lastActive && lastActive > sevenDaysAgo
                ? 'success'
                : 'default'
            }
          />
        </div>
      </section>

      {/* Tenant info */}
      <section className="bg-card border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">
          {t('tenantDetail.infoSectionTitle')}
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <InfoRow label={t('createTenant.cuiLabel')} value={tenant.cui} />
          <InfoRow label={t('createTenant.registrationLabel')} value={tenant.registrationNumber} />
          <InfoRow label={t('common.email')} value={tenant.email} />
          <InfoRow label={t('common.phone')} value={tenant.phone} />
          <InfoRow
            label={t('common.address')}
            value={
              [tenant.addressLine1, tenant.city, tenant.county, tenant.postalCode]
                .filter(Boolean)
                .join(', ') || null
            }
          />
          <InfoRow label={t('common.createdAt')} value={dateFormatter.format(tenant.createdAt)} />
        </dl>
      </section>

      {/* Members with last-seen */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t('tenantDetail.membersSectionTitle')}{' '}
          <span className="text-muted-foreground font-normal text-base">
            ({tenant.users.length})
          </span>
        </h2>

        {tenant.users.length === 0 ? (
          <EmptyState
            illustration="team"
            title={t('team.emptyTitle')}
            description={t('team.emptyDescription')}
          />
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.email')}</TableHead>
                  <TableHead>{t('tenantDetail.membersTable.roles')}</TableHead>
                  <TableHead>{t('tenantDetail.membersTable.accountStatus')}</TableHead>
                  <TableHead>{t('tenantDetail.membersTable.lastSeen')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenant.users.map((user) => {
                  const isActivated = user.authUserId !== null
                  const isRecentlyActive =
                    user.lastLoginAt && user.lastLoginAt > sevenDaysAgo
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.firstName} {user.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <span
                              key={role}
                              className="inline-block px-2 py-0.5 text-xs rounded bg-secondary text-secondary-foreground"
                            >
                              {t(`tenantDetail.invitations.role_${role}`)}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1.5 text-sm ${
                            isActivated ? 'text-green-700' : 'text-amber-700'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isActivated ? 'bg-green-600' : 'bg-amber-500'
                            }`}
                          />
                          {isActivated
                            ? t('tenantDetail.membersTable.activated')
                            : t('tenantDetail.membersTable.pending')}
                        </span>
                      </TableCell>
                      <TableCell>
                        {user.lastLoginAt ? (
                          <span
                            className={`text-sm ${
                              isRecentlyActive ? 'text-green-700' : 'text-muted-foreground'
                            }`}
                          >
                            {dateTimeFormatter.format(user.lastLoginAt)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            {t('superAdmin.tenantsTable.neverActive')}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <TenantInviteSection
        tenantId={tenant.id}
        tenantName={tenant.name}
        labels={inviteLabels}
        initialPendingInvitations={pendingInvitations.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          invitedByName: `${inv.invitedBy.firstName} ${inv.invitedBy.lastName}`,
          expiresAt: inv.expiresAt.toISOString(),
        }))}
      />
    </div>
  )
}

function ActivityCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'success' | 'destructive'
}) {
  return (
    <div
      className={`border rounded-lg p-4 ${
        tone === 'destructive' ? 'border-destructive bg-destructive/5' : ''
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`text-xl font-bold mt-1 ${
          tone === 'destructive' ? 'text-destructive' : tone === 'success' ? 'text-green-700' : ''
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd>{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}
