export type WebhookEvent =
  | 'examination.signed'
  | 'examination.scheduled'
  | 'examination.completed'
  // A previously signed fișă was withdrawn. Consumers that acted on
  // 'examination.signed' need this to stop relying on that certificate.
  | 'examination.revoked'
  | 'recall.due_soon'
  | 'employee.created'
  | 'employee.updated'

export interface WebhookPayload {
  event: WebhookEvent
  timestamp: string
  tenantId: string
  data: Record<string, unknown>
}
