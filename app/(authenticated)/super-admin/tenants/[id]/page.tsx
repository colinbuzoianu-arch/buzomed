import { notFound } from 'next/navigation'
import Link from 'next/link'
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

/**
 * Tenant detail page for super-admins.
 *
 * Shows:
 *   1. Tenant header (name, slug, status, subscription)
 *   2. Members table (existing User rows tied to the tenant)
 *   3. Invite button + pending invitations table (interactive client section)
 *
 * Member rows show whether the user has activated their account
 * (authUserId !== null) so super-admins can see who's pending vs. active.
 */

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
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      },
    },
  })

  if (!tenant) notFound()

  // Pending invitations served as initial data; the client component
  // can refresh from the API after create/revoke actions.
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

  // Pre-translate strings for the client component (it can't call the
  // server translator). Same pattern the create-tenant form uses.
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
          <h1 className="text-3xl font-bold">{tenant.name}</h1>
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

      {/* Tenant info grid */}
      <section className="bg-card border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">
          {t('tenantDetail.infoSectionTitle')}
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <InfoRow label={t('createTenant.cuiLabel')} value={tenant.cui} />
          <InfoRow
            label={t('createTenant.registrationLabel')}
            value={tenant.registrationNumber}
          />
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
          <InfoRow
            label={t('common.createdAt')}
            value={dateFormatter.format(tenant.createdAt)}
          />
        </dl>
      </section>

      {/* Members table */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t('tenantDetail.membersSectionTitle')}{' '}
          <span className="text-muted-foreground font-normal text-base">
            ({tenant.users.length})
          </span>
        </h2>

        {tenant.users.length === 0 ? (
          <div className="border border-dashed rounded-lg p-8 text-center">
            <p className="text-muted-foreground text-sm">
              {t('tenantDetail.noMembers')}
            </p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.email')}</TableHead>
                  <TableHead>{t('tenantDetail.membersTable.roles')}</TableHead>
                  <TableHead>{t('tenantDetail.membersTable.accountStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenant.users.map((user) => {
                  const isActivated = user.authUserId !== null
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.firstName} {user.lastName}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
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
                            isActivated
                              ? 'text-green-700'
                              : 'text-amber-700'
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
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Invite section — interactive */}
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

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd>{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}
