import { optionalDate, optionalString } from '@/lib/validation'

/**
 * Shared invoice input parsing + totals math, used by both the per-company
 * invoice routes (app/api/companies/[id]/invoices) and the per-intermediary
 * invoice routes (app/api/intermediaries/[id]/invoices). Extracted here so
 * the two recipient types don't drift on validation or rounding rules.
 */

export const VAT_EXEMPT_REASON =
  'Scutit de TVA conform Art. 292 alin. (1) lit. a) pct. 1 din Codul Fiscal'

export interface ParsedItem {
  description: string
  quantity: number
  unitPrice: number
  // Only meaningful on intermediary invoices — attributes the line to the
  // real employer company being billed through the intermediary. Route
  // handlers are responsible for validating this against the actual set of
  // companies linked to the intermediary; this parser only checks shape.
  companyId?: string
}

export interface ParsedInvoiceInput {
  contractId?: string
  vatRate?: number
  dueDate?: Date
  currency?: string
  notes?: string
  items: ParsedItem[]
}

export function parseInvoiceInput(
  body: Record<string, unknown>,
  issues: string[]
): ParsedInvoiceInput {
  const result: ParsedInvoiceInput = { items: [] }

  if (body.contractId != null) {
    if (typeof body.contractId !== 'string') issues.push('contractId must be a string')
    else result.contractId = body.contractId
  }

  if (body.vatRate !== undefined && body.vatRate !== null) {
    const v = body.vatRate
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 1)
      issues.push('vatRate must be a number between 0 and 1')
    else result.vatRate = v
  }

  result.dueDate = optionalDate('dueDate', body.dueDate, issues)
  result.currency = optionalString('currency', body.currency, issues, { maxLength: 3 }) ?? 'RON'
  result.notes = optionalString('notes', body.notes, issues, { maxLength: 4000 })

  if (!Array.isArray(body.items)) {
    issues.push('items must be an array')
  } else {
    result.items = (body.items as unknown[]).flatMap((raw, idx) => {
      if (typeof raw !== 'object' || raw === null) {
        issues.push(`items[${idx}]: must be an object`)
        return []
      }
      const item = raw as Record<string, unknown>
      const desc = typeof item.description === 'string' ? item.description.trim() : ''
      const qty = typeof item.quantity === 'number' ? item.quantity : NaN
      const price = typeof item.unitPrice === 'number' ? item.unitPrice : NaN
      const itemIssues: string[] = []
      if (!desc) itemIssues.push('description is required')
      if (Number.isNaN(qty) || qty <= 0) itemIssues.push('quantity must be > 0')
      if (Number.isNaN(price) || price < 0) itemIssues.push('unitPrice must be >= 0')
      let companyId: string | undefined
      if (item.companyId != null) {
        if (typeof item.companyId !== 'string') itemIssues.push('companyId must be a string')
        else companyId = item.companyId
      }
      if (itemIssues.length > 0) {
        issues.push(`items[${idx}]: ${itemIssues.join(', ')}`)
        return []
      }
      return [{ description: desc, quantity: qty, unitPrice: price, companyId }]
    })
  }

  return result
}

export function computeTotals(
  items: ParsedItem[],
  vatRate: number
): { subtotal: number; vatAmount: number; total: number } {
  const subtotal = items.reduce((sum, i) => {
    return sum + Math.round(i.quantity * i.unitPrice * 100) / 100
  }, 0)
  const vatAmount = Math.round(subtotal * vatRate * 100) / 100
  const total = Math.round((subtotal + vatAmount) * 100) / 100
  return { subtotal, vatAmount, total }
}
