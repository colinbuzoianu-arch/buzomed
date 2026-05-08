/**
 * Public API for the email module.
 *
 * Usage:
 *   import { sendEmail, renderInviteEmail } from '@/lib/email'
 *
 *   const content = renderInviteEmail({ ... })
 *   await sendEmail({ to: { email: 'x@y.com' }, content })
 */

export { sendEmail } from './send'
export { renderInviteEmail } from './templates'
export type {
  Locale,
  EmailRecipient,
  EmailContent,
  SendEmailParams,
  SendEmailResult,
  InviteEmailProps,
} from './types'
