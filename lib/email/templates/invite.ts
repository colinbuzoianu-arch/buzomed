import type { EmailContent, InviteEmailProps, Locale } from '../types'
import { escapeHtml, renderButton, renderEmailLayout } from './layout'
import type { UserRole } from '@prisma/client'

/**
 * Invite email template. Renders both HTML and plain text versions
 * in the inviter's locale.
 *
 * Role labels are translated. Tenant name and inviter name are
 * passed through as-is (escaped for HTML).
 */
export function renderInviteEmail(props: InviteEmailProps): EmailContent {
  const t = translations[props.locale]
  const roleLabel = t.roles[props.role]
  const expiresAtFormatted = formatDate(props.expiresAt, props.locale)

  const subject = t.subject(props.tenantName, roleLabel)
  const preheader = t.preheader(props.inviterName, props.tenantName)

  const html = renderHtml({ ...props, t, roleLabel, expiresAtFormatted })
  const text = renderText({ ...props, t, roleLabel, expiresAtFormatted })

  return { subject, html, text }
}

// ---------- HTML rendering ----------

interface RenderInternalProps extends InviteEmailProps {
  t: (typeof translations)[Locale]
  roleLabel: string
  expiresAtFormatted: string
}

function renderHtml(p: RenderInternalProps): string {
  const greeting = p.recipientName
    ? p.t.greetingNamed(p.recipientName)
    : p.t.greetingAnonymous

  const body = `
<p style="margin: 0 0 16px 0;">${escapeHtml(greeting)}</p>

<p style="margin: 0 0 16px 0;">
${p.t.bodyIntro({
  inviterName: escapeHtml(p.inviterName),
  tenantName: escapeHtml(p.tenantName),
  roleLabel: escapeHtml(p.roleLabel),
})}
</p>

<p style="margin: 0 0 8px 0;">${escapeHtml(p.t.bodyCallToAction)}</p>

${renderButton(p.t.buttonLabel, p.acceptUrl)}

<p style="margin: 0 0 16px 0; font-size: 13px; color: #6b7280;">
${escapeHtml(p.t.expiryNotice(p.expiresAtFormatted))}
</p>

<p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">
${escapeHtml(p.t.linkFallbackIntro)}
</p>
<p style="margin: 0 0 16px 0; font-size: 13px; word-break: break-all;">
<a href="${escapeHtml(p.acceptUrl)}" style="color: #1d4f99;">${escapeHtml(p.acceptUrl)}</a>
</p>

<p style="margin: 24px 0 0 0; font-size: 13px; color: #6b7280;">
${escapeHtml(p.t.ignoreNotice)}
</p>
`

  return renderEmailLayout({
    body,
    preheader: p.t.preheader(p.inviterName, p.tenantName),
    footerText: p.t.footer,
  })
}

// ---------- Plain text rendering ----------

function renderText(p: RenderInternalProps): string {
  const greeting = p.recipientName
    ? p.t.greetingNamed(p.recipientName)
    : p.t.greetingAnonymous

  return [
    greeting,
    '',
    p.t.bodyIntro({
      inviterName: p.inviterName,
      tenantName: p.tenantName,
      roleLabel: p.roleLabel,
    }),
    '',
    p.t.bodyCallToAction,
    '',
    p.acceptUrl,
    '',
    p.t.expiryNotice(p.expiresAtFormatted),
    '',
    p.t.ignoreNotice,
    '',
    '—',
    p.t.footer,
  ].join('\n')
}

// ---------- Translations ----------

interface InviteCopy {
  subject: (tenantName: string, roleLabel: string) => string
  preheader: (inviterName: string, tenantName: string) => string
  greetingNamed: (name: string) => string
  greetingAnonymous: string
  bodyIntro: (args: {
    inviterName: string
    tenantName: string
    roleLabel: string
  }) => string
  bodyCallToAction: string
  buttonLabel: string
  expiryNotice: (formattedDate: string) => string
  linkFallbackIntro: string
  ignoreNotice: string
  footer: string
  roles: Record<UserRole, string>
}

const translations: Record<Locale, InviteCopy> = {
  ro: {
    subject: (tenantName, roleLabel) =>
      `Invitație Buzomed: ${roleLabel} la ${tenantName}`,
    preheader: (inviterName, tenantName) =>
      `${inviterName} v-a invitat să vă alăturați ${tenantName} pe Buzomed`,
    greetingNamed: (name) => `Bună, ${name},`,
    greetingAnonymous: 'Bună,',
    bodyIntro: ({ inviterName, tenantName, roleLabel }) =>
      `${inviterName} v-a invitat să vă alăturați <strong>${tenantName}</strong> pe Buzomed în calitate de <strong>${roleLabel}</strong>.`,
    bodyCallToAction:
      'Pentru a accepta invitația și a vă crea contul, accesați linkul de mai jos:',
    buttonLabel: 'Acceptă invitația',
    expiryNotice: (formattedDate) =>
      `Această invitație expiră pe ${formattedDate}.`,
    linkFallbackIntro:
      'Dacă butonul de mai sus nu funcționează, copiați acest link în browser:',
    ignoreNotice:
      'Dacă nu așteptați această invitație, puteți ignora acest email.',
    footer:
      'Buzomed — platformă pentru medicina muncii. Acest email a fost trimis automat.',
    roles: {
      super_admin: 'Super-administrator',
      practice_admin: 'Administrator cabinet',
      practitioner: 'Medic',
      assistant: 'Asistent',
      company_hr: 'HR Angajator',
    },
  },
  en: {
    subject: (tenantName, roleLabel) =>
      `Buzomed invitation: ${roleLabel} at ${tenantName}`,
    preheader: (inviterName, tenantName) =>
      `${inviterName} invited you to join ${tenantName} on Buzomed`,
    greetingNamed: (name) => `Hi ${name},`,
    greetingAnonymous: 'Hi,',
    bodyIntro: ({ inviterName, tenantName, roleLabel }) =>
      `${inviterName} has invited you to join <strong>${tenantName}</strong> on Buzomed as a <strong>${roleLabel}</strong>.`,
    bodyCallToAction:
      'To accept the invitation and create your account, click the link below:',
    buttonLabel: 'Accept invitation',
    expiryNotice: (formattedDate) =>
      `This invitation expires on ${formattedDate}.`,
    linkFallbackIntro:
      'If the button above does not work, copy this link into your browser:',
    ignoreNotice:
      'If you were not expecting this invitation, you can safely ignore this email.',
    footer:
      'Buzomed — occupational medicine platform. This email was sent automatically.',
    roles: {
      super_admin: 'Super Administrator',
      practice_admin: 'Practice Administrator',
      practitioner: 'Practitioner',
      assistant: 'Assistant',
      company_hr: 'Employer HR',
    },
  },
}

// ---------- Date formatting ----------

function formatDate(date: Date, locale: Locale): string {
  const formatter = new Intl.DateTimeFormat(
    locale === 'ro' ? 'ro-RO' : 'en-GB',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  )
  return formatter.format(date)
}
