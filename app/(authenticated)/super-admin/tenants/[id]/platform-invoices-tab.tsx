'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

const PRESETS = [
  { label: 'Solo · 1 lună', description: 'Abonament Buzomed Solo', unitPrice: 150 },
  { label: 'Cabinet · 1 lună', description: 'Abonament Buzomed Cabinet', unitPrice: 350 },
  { label: 'Corporativ · 1 lună', description: 'Abonament Buzomed Corporativ', unitPrice: 700 },
]

const MONTHS_RO = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

function currentMonthLabel() {
  const d = new Date()
  return `${MONTHS_RO[d.getMonth()]} ${d.getFullYear()}`
}

type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled'

type PlatformInvoice = {
  id: string
  invoiceNumber: string
  status: InvoiceStatus
  issuedAt: string | null
  dueDate: string | null
  paidAt: string | null
  total: string
  currency: string
  snapshotTenantName: string | null
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const map: Record<InvoiceStatus, string> = {
    draft:     'bg-slate-100 text-slate-600',
    issued:    'bg-blue-100 text-blue-700',
    paid:      'bg-green-100 text-green-700',
    overdue:   'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-400 line-through',
  }
  const label: Record<InvoiceStatus, string> = {
    draft: 'Draft', issued: 'Emis', paid: 'Plătit', overdue: 'Restanță', cancelled: 'Anulat',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[status]}`}>
      {label[status]}
    </span>
  )
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(s))
}

export function PlatformInvoicesTab({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Form state
  const [selectedPreset, setSelectedPreset] = useState(1) // Cabinet by default
  const [description, setDescription] = useState(PRESETS[1].description)
  const [billingMonth, setBillingMonth] = useState(currentMonthLabel())
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(PRESETS[1].unitPrice)
  const [dueDate, setDueDate] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  async function fetchInvoices() {
    setLoading(true)
    try {
      const res = await fetch(`/api/super-admin/platform-invoices?tenantId=${tenantId}`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data.invoices)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchInvoices() }, [tenantId])

  function applyPreset(idx: number) {
    setSelectedPreset(idx)
    setDescription(PRESETS[idx].description)
    setUnitPrice(PRESETS[idx].unitPrice)
  }

  function resetForm() {
    setSelectedPreset(1)
    setDescription(PRESETS[1].description)
    setBillingMonth(currentMonthLabel())
    setQuantity(1)
    setUnitPrice(PRESETS[1].unitPrice)
    setDueDate('')
    setFormNotes('')
    setFormError('')
  }

  async function handleCreate() {
    if (!description.trim()) { setFormError('Descrierea este obligatorie.'); return }
    if (quantity <= 0 || unitPrice <= 0) { setFormError('Cantitate și preț trebuie să fie > 0.'); return }

    const fullDescription = billingMonth.trim()
      ? `${description.trim()} — ${billingMonth.trim()}`
      : description.trim()
    const lineTotal = quantity * unitPrice

    setFormLoading(true)
    setFormError('')
    try {
      const res = await fetch('/api/super-admin/platform-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          vatRate: 0,
          dueDate: dueDate || undefined,
          notes: formNotes || undefined,
          items: [{ description: fullDescription, quantity, unitPrice, lineTotal }],
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setFormError(err.error ?? 'Eroare la creare.')
        return
      }
      setDialogOpen(false)
      resetForm()
      await fetchInvoices()
    } finally {
      setFormLoading(false)
    }
  }

  async function doAction(invoiceId: string, action: 'issue' | 'pay' | 'cancel' | 'delete' | 'email') {
    setActionLoading(`${invoiceId}-${action}`)
    try {
      if (action === 'delete') {
        await fetch(`/api/super-admin/platform-invoices/${invoiceId}`, { method: 'DELETE' })
      } else if (action === 'email') {
        const res = await fetch(`/api/super-admin/platform-invoices/${invoiceId}/send-email`, { method: 'POST' })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          alert(err.message ?? 'Eroare la trimiterea emailului.')
          return
        }
        alert('Email trimis cu succes.')
      } else {
        await fetch(`/api/super-admin/platform-invoices/${invoiceId}/${action}`, { method: 'POST' })
      }
      await fetchInvoices()
    } finally {
      setActionLoading(null)
    }
  }

  function downloadPdf(invoiceId: string) {
    window.open(`/api/super-admin/platform-invoices/${invoiceId}/pdf`, '_blank')
  }

  const isActing = (id: string, action: string) => actionLoading === `${id}-${action}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {invoices.length === 0 && !loading ? 'Nicio factură emisă încă.' : `${invoices.length} factură(i)`}
        </p>
        <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true) }}>
          + Factură nouă
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground animate-pulse">Se încarcă...</div>
      ) : invoices.length > 0 ? (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/30 text-xs tracking-wide border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-muted-foreground">Număr</th>
                  <th className="text-left px-4 py-3 text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 text-muted-foreground">Total</th>
                  <th className="text-left px-4 py-3 text-muted-foreground">Emis la</th>
                  <th className="text-left px-4 py-3 text-muted-foreground">Scadență</th>
                  <th className="text-right px-4 py-3 text-muted-foreground">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3 text-right font-medium">
                      {Number(inv.total).toFixed(2)} {inv.currency}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(inv.issuedAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(inv.dueDate)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <ActionButtons inv={inv} doAction={doAction} downloadPdf={downloadPdf} isActing={isActing} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {invoices.map((inv) => (
              <div key={inv.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium">{inv.invoiceNumber}</span>
                  <StatusBadge status={inv.status} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Total</span>
                  <span className="font-medium">{Number(inv.total).toFixed(2)} {inv.currency}</span>
                </div>
                {inv.dueDate && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Scadență</span>
                    <span>{fmtDate(inv.dueDate)}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <ActionButtons inv={inv} doAction={doAction} downloadPdf={downloadPdf} isActing={isActing} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* New invoice dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Factură nouă — {tenantName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Preset selector */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Preset abonament</Label>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyPreset(i)}
                    className={`text-xs border rounded-md px-2 py-2 text-left transition-colors ${
                      selectedPreset === i
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium">{p.label}</div>
                    <div className="text-muted-foreground mt-0.5">{p.unitPrice} RON</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="pi-month">Lună facturată</Label>
              <Input
                id="pi-month"
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
                placeholder="mai 2026"
              />
            </div>

            <div>
              <Label htmlFor="pi-desc">Descriere serviciu</Label>
              <Input
                id="pi-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pi-qty">Cantitate</Label>
                <Input
                  id="pi-qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="pi-price">Preț unitar (RON)</Label>
                <Input
                  id="pi-price"
                  type="number"
                  min={0}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{(quantity * unitPrice).toFixed(2)} RON</span>
            </div>

            <div>
              <Label htmlFor="pi-due">Scadență (opțional)</Label>
              <Input id="pi-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <div>
              <Label htmlFor="pi-notes">Note (opțional)</Label>
              <Input id="pi-notes" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="..." />
            </div>

            {formError && <p className="text-xs text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={formLoading}>
              Anulează
            </Button>
            <Button onClick={handleCreate} disabled={formLoading}>
              {formLoading ? 'Se salvează...' : 'Salvează Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ActionButtons({
  inv,
  doAction,
  downloadPdf,
  isActing,
}: {
  inv: PlatformInvoice
  doAction: (id: string, action: 'issue' | 'pay' | 'cancel' | 'delete' | 'email') => Promise<void>
  downloadPdf: (id: string) => void
  isActing: (id: string, action: string) => boolean
}) {
  return (
    <>
      {inv.status === 'draft' && (
        <>
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs"
            onClick={() => doAction(inv.id, 'issue')}
            disabled={isActing(inv.id, 'issue')}
          >
            {isActing(inv.id, 'issue') ? '...' : 'Emite'}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => downloadPdf(inv.id)}>
            PDF
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => { if (confirm('Ștergi factura draft?')) doAction(inv.id, 'delete') }}
            disabled={isActing(inv.id, 'delete')}
          >
            Șterge
          </Button>
        </>
      )}
      {(inv.status === 'issued' || inv.status === 'overdue') && (
        <>
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs"
            onClick={() => doAction(inv.id, 'pay')}
            disabled={isActing(inv.id, 'pay')}
          >
            {isActing(inv.id, 'pay') ? '...' : 'Plătită'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => doAction(inv.id, 'email')}
            disabled={isActing(inv.id, 'email')}
          >
            {isActing(inv.id, 'email') ? '...' : 'Email'}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => downloadPdf(inv.id)}>
            PDF
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => { if (confirm('Anulezi factura?')) doAction(inv.id, 'cancel') }}
            disabled={isActing(inv.id, 'cancel')}
          >
            Anulează
          </Button>
        </>
      )}
      {(inv.status === 'paid' || inv.status === 'cancelled') && (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => downloadPdf(inv.id)}>
          PDF
        </Button>
      )}
    </>
  )
}
