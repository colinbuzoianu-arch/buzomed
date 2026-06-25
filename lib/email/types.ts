/**
 * Shared types for the email module.
 *
 * Kept provider-agnostic so swapping Brevo for Resend, Postmark, or
 * SES later requires changes only in client.ts and send.ts.
 */

import type { UserRole } from '@prisma/client'

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
   * Tenant this email belongs to — used for delivery log attribution.
   * Pass null for pre-signup / cross-tenant sends (contact form, etc.).
   */
  tenantId?: string | null
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
  /**
   * Optional single file attachment (e.g. a PDF invoice).
   */
  attachment?: {
    /** Base64-encoded file content */
    content: string
    /** Filename with extension, e.g. "factura_2025-001.pdf" */
    name: string
  }
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Props for the invite email template.
 *
 * `role` reuses the canonical UserRole enum from Prisma so there's
 * no risk of drift between what we invite and what we grant.
 * Note: `super_admin` is technically allowed by the type but the
 * service layer rejects it (super_admins are bootstrapped, not invited).
 */
export interface InviteEmailProps {
  recipientEmail: string
  recipientName?: string
  inviterName: string
  tenantName: string
  role: UserRole
  acceptUrl: string
  expiresAt: Date
  locale: Locale
}
