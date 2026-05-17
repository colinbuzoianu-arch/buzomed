'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface InvoiceItemDraft {
  description: string
  quantity: string
  unitPrice: string
}

interface Props {
  companyId: string
  contracts: Array<{ id: string; contractNumber: string; pricePerExamination: string | null; priceMonthlyFlat: string | null }>
  submitUrl: string   // POST or PATCH URL
  method: 'POST' | 'PATCH'
  initialContractId?: string
  initialItems?: InvoiceItemDraft[]
  initialDueDate?: string
  initialNotes?: string
  labels: {
    contractLabel: string
    contractNone: string
    itemsTitle: string
    colDescription: string
    colQty: string
    colUnitPrice: string
    colTotal: string
    addItem: string
    removeItem: string
    dueDateLabel: string
    notesLabel: string
    vatExemptNotice: string
    subtotalLabel: string
    totalLabel: string
    submitButton: string
    submitting: string
    cancelButton: string
    currency: string
    errorMessage: string
  }
}

export function InvoiceForm({
  companyId,
  contracts,
  submitUrl,
  method,
  initialContractId = '',
  initialItems,
  initialDueDate = '',
  initialNotes = '',
  labels,
}: Props) {
  const router = useRouter()
  const [contractId, setContractId] = useState(initialContractId)
  const [items, setItems] = useState<InvoiceItemDraft[]>(
    initialItems ?? [{ description: '', quantity: '1', unitPrice: '' }]
  )
  const [dueDate, setDueDate] = useState(initialDueDate)
  const [notes, setNotes] = useState(initialNotes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addItem() {
    setItems((prev) => [...prev, { description: '', quantity: '1', unitPrice: '' }])
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof InvoiceItemDraft, value: string) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    )
  }

  const totals = useMemo(() => {
    let subtotal = 0
    for (const item of items) {
      const qty = parseFloat(item.quantity)
      const price = parseFloat(item.unitPrice)
      if (!isNaN(qty) && !isNaN(price)) {
        subtotal += Math.round(qty * price * 100) / 100
      }
    }
    subtotal = Math.round(subtotal * 100) / 100
    return { subtotal, vatAmount: 0, total: subtotal }
  }, [items])

  function lineTotal(item: InvoiceItemDraft): string {
    const qty = parseFloat(item.quantity)
    const price = parseFloat(item.unitPrice)
    if (isNaN(qty) || isNaN(price)) return '—'
    return (Math.round(qty * price * 100) / 100).toFixed(2)
  }

  async function handleSubmit() {
    setBusy(true)
    setError(null)
    try {
      const payload = {
        contractId: contractId || undefined,
        vatRate: 0,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        items: items.map((item) => ({
          description: item.description,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
        })),
      }
      const res = await fetch(submitUrl, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || labels.errorMessage)
        setBusy(false)
        return
      }
      const iid: string = data.invoice.id
      router.push(`/companies/${companyId}/invoices/${iid}`)
      router.refresh()
    } catch {
      setError(labels.errorMessage)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Contract selector */}
      {contracts.length > 0 && (
        <div className="space-y-2">
          <Label>{labels.contractLabel}</Label>
          <select
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            disabled={busy}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{labels.contractNone}</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.contractNumber}
                {c.pricePerExamination
                  ? ` — ${c.pricePerExamination} ${labels.currency}/exam`
                  : c.priceMonthlyFlat
                    ? ` — ${c.priceMonthlyFlat} ${labels.currency}/lună`
                    : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Line items */}
      <div className="space-y-3">
        <div className="text-sm font-medium">{labels.itemsTitle}</div>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 w-full">{labels.colDescription}</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">{labels.colQty}</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">
                  {labels.colUnitPrice} ({labels.currency})
                </th>
                <th className="text-right px-3 py-2 whitespace-nowrap">{labels.colTotal}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2">
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      disabled={busy}
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      disabled={busy}
                      className="h-8 w-20 text-right text-sm tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                      disabled={busy}
                      className="h-8 w-28 text-right text-sm tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                    {lineTotal(item)}
                  </td>
                  <td className="px-2 py-2">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        disabled={busy}
                        className="text-muted-foreground hover:text-destructive text-xs px-1"
                        title={labels.removeItem}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={busy}>
          + {labels.addItem}
        </Button>
      </div>

      {/* Totals + VAT notice */}
      <div className="border rounded-lg p-4 space-y-2 text-sm bg-muted/20">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{labels.subtotalLabel}</span>
          <span className="tabular-nums font-medium">
            {totals.subtotal.toFixed(2)} {labels.currency}
          </span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
          <span>{labels.vatExemptNotice}</span>
          <span>0.00 {labels.currency}</span>
        </div>
        <div className="flex justify-between font-semibold border-t pt-2">
          <span>{labels.totalLabel}</span>
          <span className="tabular-nums">
            {totals.total.toFixed(2)} {labels.currency}
          </span>
        </div>
      </div>

      {/* Due date + Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{labels.dueDateLabel}</Label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <Label>{labels.notesLabel}</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSubmit} disabled={busy}>
          {busy ? labels.submitting : labels.submitButton}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={busy}
        >
          {labels.cancelButton}
        </Button>
      </div>
    </div>
  )
}
