import { createHmac } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { decryptWebhookSecret } from './secret'
import type { WebhookEvent, WebhookPayload } from './events'
import { logSystemError } from '@/lib/system-log/error-log'
import { assertSafeWebhookUrl, SSRF_BLOCK_MESSAGES } from './url-guard'

export async function deliverWebhook(
  tenantId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId, isActive: true, events: { has: event } },
    select: { id: true, url: true, secretEncrypted: true },
  })

  if (endpoints.length === 0) return

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    tenantId,
    data,
  }
  const body = JSON.stringify(payload)

  for (const endpoint of endpoints) {
    const start = Date.now()
    let responseStatus: number | null = null
    let responseBody: string | null = null
    let success = false

    try {
      const secret = decryptWebhookSecret(endpoint.secretEncrypted)
      const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')

      // Re-validate at delivery time to defeat DNS rebinding attacks:
      // the hostname may have resolved to a public IP at registration but
      // been re-pointed to an internal address before this delivery fires.
      await assertSafeWebhookUrl(endpoint.url)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)

      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Buzomed-Signature': signature,
          'X-Buzomed-Event': event,
        },
        body,
        signal: controller.signal,
        redirect: 'manual', // never follow redirects — they can bypass the URL guard
      }).finally(() => clearTimeout(timer))

      responseStatus = res.status
      // Opaque redirect responses (status 0 from undici with redirect:'manual')
      // and any explicit 3xx both indicate a redirect attempt — block and log.
      const isRedirect = res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)
      if (isRedirect) {
        responseBody = 'blocked: redirect_response'
        success = false
      } else {
        responseBody = (await res.text().catch(() => null))?.slice(0, 500) ?? null
        success = res.ok
      }
    } catch (fetchErr) {
      success = false
      const msg = (fetchErr as Error).message
      if (SSRF_BLOCK_MESSAGES.has(msg)) {
        // Expected SSRF block — record reason, don't noise up system error log
        responseBody = `blocked: ${msg}`
      } else {
        void logSystemError({
          route: endpoint.url,
          method: 'WEBHOOK',
          error: fetchErr,
          context: { endpointId: endpoint.id },
        })
      }
    }

    const durationMs = Date.now() - start

    try {
      await prisma.$transaction(async (tx) => {
        await tx.webhookDelivery.create({
          data: {
            endpointId: endpoint.id,
            event,
            payload: payload as never,
            responseStatus,
            responseBody,
            durationMs,
            success,
          },
        })

        if (!success) {
          const updated = await tx.webhookEndpoint.update({
            where: { id: endpoint.id },
            data: {
              failureCount: { increment: 1 },
              ...(success ? { failureCount: 0, lastTriggeredAt: new Date() } : {}),
            },
            select: { failureCount: true },
          })
          if (updated.failureCount >= 10) {
            await tx.webhookEndpoint.update({
              where: { id: endpoint.id },
              data: { isActive: false },
            })
          }
        } else {
          await tx.webhookEndpoint.update({
            where: { id: endpoint.id },
            data: { failureCount: 0, lastTriggeredAt: new Date() },
          })
        }
      })
    } catch (dbErr) {
      console.error('[webhook] delivery log DB write failed:', dbErr)
    }
  }
}
