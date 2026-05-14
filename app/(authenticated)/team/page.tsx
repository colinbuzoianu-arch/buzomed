import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { invitableRoles } from '@/lib/permissions/invites'
import { canManageUser, ASSIGNABLE_ROLES } from '@/lib/permissions/user-admin'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TeamInviteSection } from './team-invite-section'
import { UserAdminActions } from './user-admin-actions'

/**
 * Team page for practice_admin / practitioner / assistant.
 *
 * - super_admin is redirected to /super-admin (their world)
 * - users without a tenantId are kicked back to home (shouldn't happen
 *   in practice, but defends against state drift)
 * - assistants see the team in read-only mode (no invite button) since
 *   they can't invite anyone per the hierarchy
 *
 * Members table shows everyone in the tenant with their roles and
 * activation status (same convention as the super-admin tenant detail).
 */

export default async function TeamPage() {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  // super_admin doesn't belong here
  if (user.roles.includes('super_admin')) {
    redirect('/super-admin')
  }

  // Should never happen — non-super_admin users always have a tenant —
  // but defensive check in case data drifts.
  if (!user.tenantId) {
    redirect('/')
  }

  const allowedRolesToInvite = invitableRoles(
    { roles: user.roles, tenantId: user.tenantId },
    user.tenantId
  )

  const [tenant, members, pendingInvitations] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
    }),
    prisma.invitation.findMany({
      where: {
        tenantId: user.tenantId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ])

  if (!tenant) {
    // Tenant disappeared from under the user — soft delete or admin nuke.
    redirect('/')
  }

  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-US',
    { dateStyle: 'medium' }
  )

  const isPracticeAdmin = user.roles.includes('practice_admin')

  // Pre-translate strings for the user-admin client component
  const userAdminLabels = {
    editAction: t('team.userAdmin.edit'),
    archiveAction: t('team.userAdmin.archive'),
    archiveConfirm: t('team.userAdmin.archiveConfirm'),
    dialogTitle: t('team.userAdmin.dialogTitle'),
    dialogDescription: t('team.userAdmin.dialogDescription'),
    fieldRoles: t('team.userAdmin.fieldRoles'),
    fieldRolesHelp: t('team.userAdmin.fieldRolesHelp'),
    fieldIsActive: t('team.userAdmin.fieldIsActive'),
    fieldIsActiveHelp: t('team.userAdmin.fieldIsActiveHelp'),
    fieldProfessionalTitle: t('team.userAdmin.fieldProfessionalTitle'),
    submit: t('team.userAdmin.submit'),
    saving: t('team.userAdmin.saving'),
    archiving: t('team.userAdmin.archiving'),
    cancel: t('common.cancel'),
    successUpdated: t('team.userAdmin.successUpdated'),
    successArchived: t('team.userAdmin.successArchived'),
    errorMessage: t('team.userAdmin.errorMessage'),
    errorLastAdmin: t('team.userAdmin.errorLastAdmin'),
    rolePracticeAdmin: t('team.invitations.role_practice_admin'),
    rolePractitioner: t('team.invitations.role_practitioner'),
    roleAssistant: t('team.invitations.role_assistant'),
  }

  // Pre-translate strings for the client component
  const inviteLabels = {
    sectionTitle: t('team.invitations.sectionTitle'),
    inviteButton: t('team.invitations.inviteButton'),
    noPending: t('team.invitations.noPending'),
    columnEmail: t('common.email'),
    columnRole: t('team.invitations.columnRole'),
    columnInvitedBy: t('team.invitations.columnInvitedBy'),
    columnExpiresAt: t('team.invitations.columnExpiresAt'),
    columnActions: t('common.actions'),
    revokeAction: t('team.invitations.revoke'),
    revokeConfirm: t('team.invitations.revokeConfirm'),
    dialogTitle: t('team.invitations.dialogTitle'),
    dialogDescription: t('team.invitations.dialogDescription'),
    fieldEmail: t('team.invitations.fieldEmail'),
    fieldEmailPlaceholder: t('team.invitations.fieldEmailPlaceholder'),
    fieldName: t('team.invitations.fieldName'),
    fieldNameOptional: t('team.invitations.fieldNameOptional'),
    fieldNamePlaceholder: t('team.invitations.fieldNamePlaceholder'),
    fieldRole: t('team.invitations.fieldRole'),
    sendInvite: t('team.invitations.sendInvite'),
    sending: t('team.invitations.sending'),
    cancel: t('common.cancel'),
    successMessage: t('team.invitations.successMessage'),
    errorMessage: t('team.invitations.errorMessage'),
    errorAlreadyActive: t('team.invitations.errorAlreadyActive'),
    errorInvalidEmail: t('team.invitations.errorInvalidEmail'),
    rolePracticeAdmin: t('team.invitations.role_practice_admin'),
    rolePractitioner: t('team.invitations.role_practitioner'),
    roleAssistant: t('team.invitations.role_assistant'),
    locale,
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('team.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {tenant.name}
        </p>
      </div>

      {/* Members table */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t('team.membersSectionTitle')}{' '}
          <span className="text-muted-foreground font-normal text-base">
            ({members.length})
          </span>
        </h2>

        {members.length === 0 ? (
          <div className="border border-dashed rounded-lg p-8 text-center">
            <p className="text-muted-foreground text-sm">
              {t('team.noMembers')}
            </p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.email')}</TableHead>
                  <TableHead>{t('team.membersTable.roles')}</TableHead>
                  <TableHead>{t('team.membersTable.accountStatus')}</TableHead>
                  {isPracticeAdmin && (
                    <TableHead className="text-right">
                      {t('common.actions')}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isActivated = member.authUserId !== null
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        {member.firstName} {member.lastName}
                        {member.id === user.id && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({t('team.membersTable.you')})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {member.roles.map((role) => (
                            <span
                              key={role}
                              className="inline-block px-2 py-0.5 text-xs rounded bg-secondary text-secondary-foreground"
                            >
                              {t(`team.invitations.role_${role}`)}
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
                            ? t('team.membersTable.activated')
                            : t('team.membersTable.pending')}
                        </span>
                      </TableCell>
                      {isPracticeAdmin && (
                        <TableCell className="text-right">
                          {(() => {
                            const check = canManageUser(
                              {
                                id: user.id,
                                roles: user.roles,
                                tenantId: user.tenantId,
                              },
                              {
                                id: member.id,
                                roles: member.roles,
                                tenantId: member.tenantId,
                              }
                            )
                            if (!check.allowed) {
                              return (
                                <span className="text-xs text-muted-foreground">
                                  —
                                </span>
                              )
                            }
                            return (
                              <UserAdminActions
                                userId={member.id}
                                userDisplayName={`${member.firstName} ${member.lastName}`}
                                currentRoles={member.roles}
                                currentIsActive={member.isActive}
                                currentProfessionalTitle={
                                  member.professionalTitle ?? ''
                                }
                                assignableRoles={ASSIGNABLE_ROLES}
                                labels={userAdminLabels}
                              />
                            )
                          })()}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Invite section — interactive, hidden if user can't invite anyone */}
      {allowedRolesToInvite.length > 0 ? (
        <TeamInviteSection
          tenantId={tenant.id}
          tenantName={tenant.name}
          allowedRoles={allowedRolesToInvite}
          labels={inviteLabels}
          initialPendingInvitations={pendingInvitations.map((inv) => ({
            id: inv.id,
            email: inv.email,
            role: inv.role,
            invitedByName: `${inv.invitedBy.firstName} ${inv.invitedBy.lastName}`,
            expiresAt: inv.expiresAt.toISOString(),
          }))}
        />
      ) : pendingInvitations.length > 0 ? (
        // Read-only pending invitations view for users who can't invite
        // (assistants). They still see what's pending in their tenant.
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            {t('team.invitations.sectionTitle')}{' '}
            <span className="text-muted-foreground font-normal text-base">
              ({pendingInvitations.length})
            </span>
          </h2>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.email')}</TableHead>
                  <TableHead>{t('team.invitations.columnRole')}</TableHead>
                  <TableHead>{t('team.invitations.columnInvitedBy')}</TableHead>
                  <TableHead>{t('team.invitations.columnExpiresAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      <span className="inline-block px-2 py-0.5 text-xs rounded bg-secondary text-secondary-foreground">
                        {t(`team.invitations.role_${inv.role}`)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {inv.invitedBy.firstName} {inv.invitedBy.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {dateFormatter.format(inv.expiresAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
