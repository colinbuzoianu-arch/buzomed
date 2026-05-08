import * as brevo from '@getbrevo/brevo'
import { getBrevoClient, getDefaultSender } from './client'
import type { SendEmailParams, SendEmailResult } from './types'

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

  if (params.headers) {
    message.headers = params.headers
  }

  if (params.tags && params.tags.length > 0) {
    message.tags = params.tags
  }

  try {
    const result = await sendWithRetry(client, message)
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
