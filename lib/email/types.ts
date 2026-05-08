/**
 * Shared types for the email module.
 *
 * Kept provider-agnostic so swapping Brevo for Resend, Postmark, or
 * SES later requires changes only in client.ts and send.ts.
 */

export type Locale = 'ro' | 'en'

export interface EmailRecipient {
  email: string
  name?: string
}

export interface EmailContent {
  subject: string
  html: string
  text: string
}

export interface SendEmailParams {
  to: EmailRecipient
  content: EmailContent
  /**
   * Optional override for the From address. Defaults to the
   * BREVO_SENDER_EMAIL / BREVO_SENDER_NAME env vars.
   */
  from?: EmailRecipient
  /**
   * Optional Reply-To header. Useful for templates where you want
   * automated From but human Reply-To.
   */
  replyTo?: EmailRecipient
  /**
   * Custom headers, useful for tagging in Brevo's dashboard for
   * filtering/analytics. e.g. { 'X-Buzomed-Template': 'invite' }
   */
  headers?: Record<string, string>
  /**
   * Brevo tags (visible in their dashboard for filtering).
   */
  tags?: string[]
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Props for the invite email template.
 */
export interface InviteEmailProps {
  recipientEmail: string
  recipientName?: string
  inviterName: string
  tenantName: string
  role: 'TENANT_ADMIN' | 'DOCTOR' | 'ASSISTANT'
  acceptUrl: string
  expiresAt: Date
  locale: Locale
}
