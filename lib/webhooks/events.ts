export type WebhookEvent =
  | 'examination.signed'
  | 'examination.scheduled'
  | 'examination.completed'
  | 'recall.due_soon'
  | 'employee.created'
  | 'employee.updated'

export interface WebhookPayload {
  event: WebhookEvent
  timestamp: string
  tenantId: string
  data: Record<string, unknown>
}
