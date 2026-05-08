import * as brevo from '@getbrevo/brevo'

/**
 * Lazy-initialized singleton Brevo API client.
 *
 * The SDK reads the API key from instance state, so we initialize
 * once on first use and reuse. In Vercel serverless, each function
 * invocation gets its own module instance anyway, so this is more
 * about avoiding repeated setup within a single request lifecycle
 * than about long-lived caching.
 */

let cachedClient: brevo.TransactionalEmailsApi | null = null

export function getBrevoClient(): brevo.TransactionalEmailsApi {
  if (cachedClient) {
    return cachedClient
  }

  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    throw new Error(
      'BREVO_API_KEY environment variable is not set. ' +
        'Add it to .env.local for development or your hosting provider for production.'
    )
  }

  const client = new brevo.TransactionalEmailsApi()
  client.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey)
  cachedClient = client
  return client
}

/**
 * Returns the configured default sender, derived from env vars.
 * Throws at call time if env is misconfigured (clearer error than
 * silently sending from an unverified address).
 */
export function getDefaultSender(): { email: string; name: string } {
  const email = process.env.BREVO_SENDER_EMAIL
  const name = process.env.BREVO_SENDER_NAME

  if (!email) {
    throw new Error('BREVO_SENDER_EMAIL environment variable is not set.')
  }
  if (!name) {
    throw new Error('BREVO_SENDER_NAME environment variable is not set.')
  }

  return { email, name }
}
