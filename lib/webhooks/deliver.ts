import { createHmac } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { decryptWebhookSecret } from './secret'
import type { WebhookEvent, WebhookPayload } from './events'

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
      }).finally(() => clearTimeout(timer))

      responseStatus = res.status
      responseBody = (await res.text().catch(() => null))?.slice(0, 1000) ?? null
      success = res.ok
    } catch {
      success = false
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
    } catch {
      // delivery log failure is non-fatal
    }
  }
}
