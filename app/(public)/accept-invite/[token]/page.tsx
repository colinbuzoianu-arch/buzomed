import { notFound } from 'next/navigation'
import Link from 'next/link'
import { validateInvitationToken } from '@/lib/invitations/service'
import { getTranslator } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import { AcceptInviteForm } from './accept-invite-form'

/**
 * Public invite acceptance page at /accept-invite/[token].
 *
 * No auth required. The token IS the proof of authorization.
 *
 * Server component does the initial token validation so we can render the
 * appropriate UI for the four cases:
 *   1. Valid pending invitation → show acceptance form
 *   2. Expired → show expired message
 *   3. Revoked → show revoked message
 *   4. Already accepted → show "go sign in" message
 *   5. Invalid token → 404
 *
 * Locale is determined from the invitation itself (the inviter's locale
 * at send time), not from the visitor's cookie. This ensures the accept
 * page is in the same language as the email they got.
 */

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function AcceptInvitePage({ params }: PageProps) {
  const { token } = await params

  const result = await validateInvitationToken(token)

  if (!result.ok && result.error === 'invalid') {
    notFound()
  }

  // Narrow once for ErrorState's prop type. The notFound() guard above
  // eliminates 'invalid' at runtime, but TS loses that narrowing across
  // the closures below, so we capture the narrowed value explicitly here.
  const errorCode: 'expired' | 'revoked' | 'already_accepted' | null =
    !result.ok ? (result.error as 'expired' | 'revoked' | 'already_accepted') : null

  // For all other states (expired, revoked, accepted, valid), we render
  // a status-aware page. Look up the invitation's locale if we can.
  let locale: Locale = 'ro'
  if (result.ok) {
    locale = (result.invitation.locale === 'en' ? 'en' : 'ro') as Locale
  }
  const t = getTranslator(locale)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center">
          <Link href="/" className="text-2xl font-bold text-primary">
            Buzomed
          </Link>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto">
          {errorCode ? (
            <ErrorState
              error={errorCode}
              labels={{
                title: t(`acceptInvite.error_${errorCode}.title`),
                body: t(`acceptInvite.error_${errorCode}.body`),
                signInCta: t('acceptInvite.signInCta'),
                homeCta: t('acceptInvite.homeCta'),
              }}
            />
          ) : result.ok ? (
            <AcceptInviteForm
              token={token}
              invitation={{
                email: result.invitation.email,
                role: result.invitation.role,
                tenantName: result.invitation.tenantName,
                inviterName: result.invitation.inviterName,
                expiresAt: result.invitation.expiresAt.toISOString(),
                locale,
              }}
              labels={{
                title: t('acceptInvite.title'),
                introTemplate: t('acceptInvite.intro'),
                emailLabel: t('acceptInvite.emailLabel'),
                emailHelp: t('acceptInvite.emailHelp'),
                firstNameLabel: t('acceptInvite.firstNameLabel'),
                lastNameLabel: t('acceptInvite.lastNameLabel'),
                passwordLabel: t('acceptInvite.passwordLabel'),
                passwordHelp: t('acceptInvite.passwordHelp'),
                submitButton: t('acceptInvite.submitButton'),
                submitting: t('acceptInvite.submitting'),
                roleLabel: t(`acceptInvite.role_${result.invitation.role}`),
                successMessage: t('acceptInvite.successMessage'),
                errorMessage: t('acceptInvite.errorMessage'),
                errorInvalidPassword: t('acceptInvite.errorInvalidPassword'),
                errorInvalidName: t('acceptInvite.errorInvalidName'),
                errorAlreadyFinalized: t('acceptInvite.errorAlreadyFinalized'),
                errorServiceUnavailable: t(
                  'acceptInvite.errorServiceUnavailable'
                ),
                errorTermsRequired: t('acceptInvite.errorTermsRequired'),
                signInCta: t('acceptInvite.signInCta'),
              }}
            />
          ) : null}
        </div>
      </main>
    </div>
  )
}

interface ErrorStateLabels {
  title: string
  body: string
  signInCta: string
  homeCta: string
}

function ErrorState({
  error,
  labels,
}: {
  error: 'expired' | 'revoked' | 'already_accepted'
  labels: ErrorStateLabels
}) {
  return (
    <div className="bg-card border rounded-lg p-8 text-center space-y-4">
      <h1 className="text-2xl font-bold">{labels.title}</h1>
      <p className="text-muted-foreground">{labels.body}</p>
      <div className="pt-4">
        {error === 'already_accepted' ? (
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            {labels.signInCta}
          </Link>
        ) : (
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {labels.homeCta}
          </Link>
        )}
      </div>
    </div>
  )
}
