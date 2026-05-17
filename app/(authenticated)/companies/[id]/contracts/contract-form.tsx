'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ContractFormValues {
  startDate: string
  endDate: string
  services: string
  pricePerExamination: string
  priceMonthlyFlat: string
  currency: string
  status: string
  notes: string
}

export const emptyContractFormValues: ContractFormValues = {
  startDate: '',
  endDate: '',
  services: '',
  pricePerExamination: '',
  priceMonthlyFlat: '',
  currency: 'RON',
  status: 'draft',
  notes: '',
}

export interface ContractFormLabels {
  sectionDates: string
  sectionPricing: string
  sectionServices: string
  fieldStartDate: string
  fieldEndDate: string
  fieldEndDateHelp: string
  fieldStatus: string
  fieldCurrency: string
  fieldPricePerExamination: string
  fieldPriceMonthlyFlat: string
  fieldServices: string
  fieldServicesHelp: string
  fieldNotes: string
  submitCreate: string
  submitUpdate: string
  submitting: string
  cancel: string
  errorMessage: string
  required: string
  statusDraft: string
  statusActive: string
  statusExpired: string
  statusTerminated: string
}

interface Props {
  companyId: string
  contractId?: string
  initialValues?: ContractFormValues
  labels: ContractFormLabels
}

export function ContractForm({
  companyId,
  contractId,
  initialValues,
  labels,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [form, setForm] = useState<ContractFormValues>(
    initialValues ?? emptyContractFormValues
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!contractId

  function update<K extends keyof ContractFormValues>(
    key: K,
    value: ContractFormValues[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const services = form.services
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

    const payload: Record<string, unknown> = {
      startDate: form.startDate || undefined,
      services,
      currency: form.currency.trim() || 'RON',
      status: form.status,
    }

    if (isEdit) {
      payload.endDate = form.endDate || null
      payload.notes = form.notes.trim() || null
    } else {
      if (form.endDate) payload.endDate = form.endDate
      if (form.notes.trim()) payload.notes = form.notes.trim()
    }

    const pricePerExam = parseFloat(form.pricePerExamination)
    if (!isNaN(pricePerExam) && form.pricePerExamination.trim() !== '') {
      payload.pricePerExamination = pricePerExam
    } else if (isEdit) {
      payload.pricePerExamination = null
    }

    const priceMonthly = parseFloat(form.priceMonthlyFlat)
    if (!isNaN(priceMonthly) && form.priceMonthlyFlat.trim() !== '') {
      payload.priceMonthlyFlat = priceMonthly
    } else if (isEdit) {
      payload.priceMonthlyFlat = null
    }

    try {
      const url = isEdit
        ? `/api/companies/${companyId}/contracts/${contractId}`
        : `/api/companies/${companyId}/contracts`
      const response = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || data.error || labels.errorMessage)
        setSubmitting(false)
        return
      }

      const newId: string | undefined = data.contract?.id
      startTransition(() => {
        if (isEdit) {
          router.push(`/companies/${companyId}/contracts/${contractId}`)
        } else if (newId) {
          router.push(`/companies/${companyId}/contracts/${newId}`)
        } else {
          router.push(`/companies/${companyId}`)
        }
        router.refresh()
      })
    } catch (err) {
      console.error('Contract submit failed', err)
      setError(labels.errorMessage)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      {/* ── Dates ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionDates}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startDate">
              {labels.fieldStartDate}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="startDate"
              type="date"
              value={form.startDate}
              onChange={(e) => update('startDate', e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">{labels.fieldEndDate}</Label>
            <Input
              id="endDate"
              type="date"
              value={form.endDate}
              onChange={(e) => update('endDate', e.target.value)}
              min={form.startDate || undefined}
            />
            <p className="text-xs text-muted-foreground">
              {labels.fieldEndDateHelp}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">{labels.fieldStatus}</Label>
            <select
              id="status"
              value={form.status}
              onChange={(e) => update('status', e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="draft">{labels.statusDraft}</option>
              <option value="active">{labels.statusActive}</option>
              <option value="expired">{labels.statusExpired}</option>
              <option value="terminated">{labels.statusTerminated}</option>
            </select>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionPricing}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pricePerExamination">
              {labels.fieldPricePerExamination}
            </Label>
            <Input
              id="pricePerExamination"
              type="number"
              min={0}
              step="0.01"
              value={form.pricePerExamination}
              onChange={(e) => update('pricePerExamination', e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priceMonthlyFlat">
              {labels.fieldPriceMonthlyFlat}
            </Label>
            <Input
              id="priceMonthlyFlat"
              type="number"
              min={0}
              step="0.01"
              value={form.priceMonthlyFlat}
              onChange={(e) => update('priceMonthlyFlat', e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">{labels.fieldCurrency}</Label>
            <Input
              id="currency"
              value={form.currency}
              onChange={(e) => update('currency', e.target.value)}
              maxLength={3}
              className="uppercase"
            />
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionServices}</h2>
        <div className="space-y-2">
          <Label htmlFor="services">{labels.fieldServices}</Label>
          <textarea
            id="services"
            value={form.services}
            onChange={(e) => update('services', e.target.value)}
            placeholder={labels.fieldServicesHelp}
            className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm max-w-2xl"
          />
          <p className="text-xs text-muted-foreground">
            {labels.fieldServicesHelp}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">{labels.fieldNotes}</Label>
          <textarea
            id="notes"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm max-w-2xl"
          />
        </div>
      </section>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || !form.startDate}>
          {submitting
            ? labels.submitting
            : isEdit
              ? labels.submitUpdate
              : labels.submitCreate}
        </Button>
        <Button type="button" variant="outline" asChild disabled={submitting}>
          <Link
            href={
              isEdit
                ? `/companies/${companyId}/contracts/${contractId}`
                : `/companies/${companyId}`
            }
          >
            {labels.cancel}
          </Link>
        </Button>
      </div>
    </form>
  )
}
