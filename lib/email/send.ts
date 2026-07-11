import * as brevo from '@getbrevo/brevo'
import { getBrevoClient, getDefaultSender } from './client'
import type { SendEmailParams, SendEmailResult } from './types'
import { prisma } from '@/lib/prisma'
import { isSuppressed, generateUnsubscribeUrl } from './suppression'

const SKIPPED_SUPPRESSED = 'skipped_suppressed'

/**
 * Checks the GDPR suppression list for a suppressible send, and builds the
 * List-Unsubscribe headers for one that isn't. Shared by sendEmail and
 * sendEmailWithAttachment so both respect opt-outs identically.
 */
async function resolveSuppression(
  params: SendEmailParams
): Promise<{ suppressed: boolean; headers?: Record<string, string> }> {
  if (params.suppressible === false) {
    return { suppressed: false, headers: params.headers }
  }
  if (await isSuppressed(params.to.email)) {
    return { suppressed: true }
  }
  const unsubscribeUrl = generateUnsubscribeUrl(params.to.email)
  if (!unsubscribeUrl) {
    // EMAIL_UNSUBSCRIBE_SECRET missing — already logged in generateUnsubscribeUrl.
    // Send anyway, just without the header, rather than blocking the send.
    return { suppressed: false, headers: params.headers }
  }
  return {
    suppressed: false,
    headers: {
      ...params.headers,
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}

async function logSkippedDelivery(params: SendEmailParams, hadAttachment: boolean): Promise<void> {
  await prisma.emailDelivery
    .create({
      data: {
        tenantId: params.tenantId ?? null,
        toEmail: params.to.email,
        subject: params.content.subject,
        tags: params.tags ?? [],
        success: true,
        errorMessage: SKIPPED_SUPPRESSED,
        hadAttachment,
      },
    })
    .catch((err) => console.error('[email-delivery] log write failed:', err))
}

/**
 * Send a transactional email via Brevo.
 *
 * Single retry on transient errors (5xx, timeouts). Permanent errors
 * (4xx like 400 invalid sender, 401 bad API key) are not retried —
 * retrying won't fix them and just delays surfacing the problem.
 *
 * Returns a result object rather than throwing, so calling code can
 * decide how to handle send failures (log + retry later vs. fail
 * the API request that triggered the send).
 */
export async function sendEmail(
  params: SendEmailParams
): Promise<SendEmailResult> {
  const { suppressed, headers } = await resolveSuppression(params)
  if (suppressed) {
    await logSkippedDelivery(params, false)
    return { success: true }
  }

  const client = getBrevoClient()
  const defaultSender = getDefaultSender()

  const message = new brevo.SendSmtpEmail()
  message.subject = params.content.subject
  message.htmlContent = params.content.html
  message.textContent = params.content.text

  message.sender = {
    email: params.from?.email ?? defaultSender.email,
    name: params.from?.name ?? defaultSender.name,
  }

  message.to = [
    {
      email: params.to.email,
      ...(params.to.name && { name: params.to.name }),
    },
  ]

  if (params.replyTo) {
    message.replyTo = {
      email: params.replyTo.email,
      ...(params.replyTo.name && { name: params.replyTo.name }),
    }
  }

  if (headers) {
    message.headers = headers
  }

  if (params.tags && params.tags.length > 0) {
    message.tags = params.tags
  }

  try {
    const result = await sendWithRetry(client, message)
    await prisma.emailDelivery.create({
      data: {
        tenantId: params.tenantId ?? null,
        toEmail: params.to.email,
        subject: params.content.subject,
        tags: params.tags ?? [],
        success: true,
        messageId: result.messageId ?? null,
        hadAttachment: false,
      },
    }).catch((err) => console.error('[email-delivery] log write failed:', err))
    return {
      success: true,
      messageId: result.messageId,
    }
  } catch (err) {
    const errorMessage = extractErrorMessage(err)
    console.error('[email] Failed to send', {
      to: params.to.email,
      subject: params.content.subject,
      error: errorMessage,
    })
    await prisma.emailDelivery.create({
      data: {
        tenantId: params.tenantId ?? null,
        toEmail: params.to.email,
        subject: params.content.subject,
        tags: params.tags ?? [],
        success: false,
        errorMessage,
        hadAttachment: false,
      },
    }).catch((e) => console.error('[email-delivery] log write failed:', e))
    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Send with one retry on transient errors. Keeps the retry loop
 * simple — Brevo is generally reliable, and the invite flow can
 * itself be retried by the user if both attempts fail.
 */
async function sendWithRetry(
  client: brevo.TransactionalEmailsApi,
  message: brevo.SendSmtpEmail
): Promise<{ messageId: string | undefined }> {
  try {
    const response = await client.sendTransacEmail(message)
    return { messageId: response.body?.messageId }
  } catch (err) {
    if (isTransientError(err)) {
      // Brief backoff, then one retry
      await sleep(500)
      const response = await client.sendTransacEmail(message)
      return { messageId: response.body?.messageId }
    }
    throw err
  }
}

function isTransientError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { response?: { statusCode?: number }; code?: string }
  // Brevo SDK exposes HTTP status on response.statusCode
  const status = e.response?.statusCode
  if (typeof status === 'number') {
    return status >= 500 || status === 429
  }
  // Network-level errors
  return e.code === 'ETIMEDOUT' || e.code === 'ECONNRESET'
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & {
      response?: { body?: { message?: string; code?: string } }
    }
    if (e.response?.body?.message) {
      return `Brevo: ${e.response.body.message}${
        e.response.body.code ? ` (${e.response.body.code})` : ''
      }`
    }
    return err.message
  }
  return String(err)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Send an email with a single file attachment via Brevo.
 *
 * Separate from sendEmail to keep the core helper simple.
 * Uses the same retry logic and error handling.
 */
export async function sendEmailWithAttachment(
  params: SendEmailParams
): Promise<SendEmailResult> {
  const { suppressed, headers } = await resolveSuppression(params)
  if (suppressed) {
    await logSkippedDelivery(params, true)
    return { success: true }
  }

  const client = getBrevoClient()
  const defaultSender = getDefaultSender()

  const message = new brevo.SendSmtpEmail()
  message.subject = params.content.subject
  message.htmlContent = params.content.html
  message.textContent = params.content.text

  message.sender = {
    email: params.from?.email ?? defaultSender.email,
    name: params.from?.name ?? defaultSender.name,
  }

  message.to = [
    {
      email: params.to.email,
      ...(params.to.name && { name: params.to.name }),
    },
  ]

  if (params.replyTo) {
    message.replyTo = {
      email: params.replyTo.email,
      ...(params.replyTo.name && { name: params.replyTo.name }),
    }
  }

  if (headers) {
    message.headers = headers
  }

  if (params.tags?.length) {
    message.tags = params.tags
  }

  if (params.attachment) {
    // Brevo SDK accepts attachment as array of { content: base64, name: filename }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(message as any).attachment = [
      {
        content: params.attachment.content,
        name: params.attachment.name,
      },
    ]
  }

  try {
    const result = await sendWithRetry(client, message)
    await prisma.emailDelivery.create({
      data: {
        tenantId: params.tenantId ?? null,
        toEmail: params.to.email,
        subject: params.content.subject,
        tags: params.tags ?? [],
        success: true,
        messageId: result.messageId ?? null,
        hadAttachment: true,
      },
    }).catch((err) => console.error('[email-delivery] log write failed:', err))
    return { success: true, messageId: result.messageId }
  } catch (err) {
    const errorMessage = extractErrorMessage(err)
    console.error('[email] Failed to send with attachment', {
      to: params.to.email,
      subject: params.content.subject,
      error: errorMessage,
    })
    await prisma.emailDelivery.create({
      data: {
        tenantId: params.tenantId ?? null,
        toEmail: params.to.email,
        subject: params.content.subject,
        tags: params.tags ?? [],
        success: false,
        errorMessage,
        hadAttachment: true,
      },
    }).catch((e) => console.error('[email-delivery] log write failed:', e))
    return { success: false, error: errorMessage }
  }
}
