'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type AnafCompanyData, useAnafLookup } from '@/hooks/useAnafLookup'
import { TOAST } from '@/lib/toast'

/**
 * Shared form for create + edit of an Intermediary. Mirrors
 * app/(authenticated)/companies/company-form.tsx — mode is implicit: if
 * `intermediaryId` is given, we PATCH; otherwise we POST.
 */

export interface IntermediaryFormValues {
  name: string
  cui: string
  nrRegCom: string
  address: string
  city: string
  county: string
  iban: string
  bank: string
  contactPersonName: string
  contactPersonEmail: string
  contactPersonPhone: string
  notes: string
  isActive: boolean
}

export const emptyIntermediaryFormValues: IntermediaryFormValues = {
  name: '',
  cui: '',
  nrRegCom: '',
  address: '',
  city: '',
  county: '',
  iban: '',
  bank: '',
  contactPersonName: '',
  contactPersonEmail: '',
  contactPersonPhone: '',
  notes: '',
  isActive: true,
}

export interface IntermediaryFormLabels {
  sectionInfo: string
  sectionAddress: string
  sectionContact: string
  sectionNotes: string
  sectionStatus: string
  fieldName: string
  fieldNamePlaceholder: string
  fieldCui: string
  fieldNrRegCom: string
  fieldAddress: string
  fieldCity: string
  fieldCounty: string
  fieldIban: string
  fieldBank: string
  fieldContactPersonName: string
  fieldContactPersonEmail: string
  fieldContactPersonPhone: string
  fieldNotes: string
  fieldIsActive: string
  required: string
  submitCreate: string
  submitUpdate: string
  submitting: string
  cancel: string
  errorMessage: string
  anafFound: string
  anafInactive: string
}

interface Props {
  intermediaryId?: string
  initialValues?: IntermediaryFormValues
  labels: IntermediaryFormLabels
}

export function IntermediaryForm({ intermediaryId, initialValues, labels }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [form, setForm] = useState<IntermediaryFormValues>(
    initialValues ?? emptyIntermediaryFormValues
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!intermediaryId

  const handleAnafSuccess = useCallback((data: AnafCompanyData) => {
    setForm((prev) => ({
      ...prev,
      name: data.denumire || prev.name,
      nrRegCom: data.nrRegCom || prev.nrRegCom,
      address: data.adresa || prev.address,
    }))
  }, [])

  const { lookup, status: anafStatus, error: anafError } = useAnafLookup(handleAnafSuccess)

  function update<K extends keyof IntermediaryFormValues>(
    key: K,
    value: IntermediaryFormValues[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      isActive: form.isActive,
    }
    const stringFields: Array<keyof IntermediaryFormValues> = [
      'cui',
      'nrRegCom',
      'address',
      'city',
      'county',
      'iban',
      'bank',
      'contactPersonName',
      'contactPersonEmail',
      'contactPersonPhone',
      'notes',
    ]
    for (const f of stringFields) {
      const trimmed = (form[f] as string).trim()
      if (isEdit) {
        payload[f] = trimmed // sends '' → clears column
      } else if (trimmed !== '') {
        payload[f] = trimmed
      }
    }

    try {
      const url = isEdit ? `/api/intermediaries/${intermediaryId}` : '/api/intermediaries'
      const method = isEdit ? 'PATCH' : 'POST'
      const response = await fetch(url, {
        method,
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

      const newId: string | undefined = data.intermediary?.id
      TOAST.saved()
      startTransition(() => {
        if (isEdit) {
          router.push(`/intermediaries/${intermediaryId}`)
        } else if (newId) {
          router.push(`/intermediaries/${newId}`)
        } else {
          router.push('/intermediaries')
        }
        router.refresh()
      })
    } catch (err) {
      console.error('Intermediary submit failed', err)
      setError(labels.errorMessage)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionInfo}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cui">{labels.fieldCui}</Label>
            <div className="relative">
              <Input
                id="cui"
                value={form.cui}
                onChange={(e) => {
                  update('cui', e.target.value)
                  lookup(e.target.value)
                }}
                placeholder="ex. 12345678"
                className="pr-8"
                autoFocus
              />
              {anafStatus === 'loading' && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              )}
              {(anafStatus === 'found' || anafStatus === 'inactive') && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base leading-none">
                  {anafStatus === 'found' ? '✓' : '⚠'}
                </span>
              )}
            </div>
            {anafStatus === 'found' && <p className="text-xs text-green-700">{labels.anafFound}</p>}
            {anafStatus === 'inactive' && (
              <p className="text-xs text-amber-700 font-medium">{labels.anafInactive}</p>
            )}
            {anafStatus === 'error' && anafError && (
              <p className="text-xs text-muted-foreground">{anafError}</p>
            )}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name">
              {labels.fieldName} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder={labels.fieldNamePlaceholder}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nrRegCom">{labels.fieldNrRegCom}</Label>
            <Input
              id="nrRegCom"
              value={form.nrRegCom}
              onChange={(e) => update('nrRegCom', e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionAddress}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address">{labels.fieldAddress}</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">{labels.fieldCity}</Label>
            <Input id="city" value={form.city} onChange={(e) => update('city', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="county">{labels.fieldCounty}</Label>
            <Input
              id="county"
              value={form.county}
              onChange={(e) => update('county', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="iban">{labels.fieldIban}</Label>
            <Input id="iban" value={form.iban} onChange={(e) => update('iban', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank">{labels.fieldBank}</Label>
            <Input id="bank" value={form.bank} onChange={(e) => update('bank', e.target.value)} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionContact}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="contactPersonName">{labels.fieldContactPersonName}</Label>
            <Input
              id="contactPersonName"
              value={form.contactPersonName}
              onChange={(e) => update('contactPersonName', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPersonPhone">{labels.fieldContactPersonPhone}</Label>
            <Input
              id="contactPersonPhone"
              value={form.contactPersonPhone}
              onChange={(e) => update('contactPersonPhone', e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="contactPersonEmail">{labels.fieldContactPersonEmail}</Label>
            <Input
              id="contactPersonEmail"
              type="email"
              value={form.contactPersonEmail}
              onChange={(e) => update('contactPersonEmail', e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionNotes}</h2>
        <div className="space-y-2">
          <Label htmlFor="notes">{labels.fieldNotes}</Label>
          <textarea
            id="notes"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionStatus}</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => update('isActive', e.target.checked)}
          />
          <span className="text-sm">{labels.fieldIsActive}</span>
        </label>
      </section>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || !form.name.trim()}>
          {submitting ? labels.submitting : isEdit ? labels.submitUpdate : labels.submitCreate}
        </Button>
        <Button type="button" variant="outline" asChild disabled={submitting}>
          <Link href={isEdit ? `/intermediaries/${intermediaryId}` : '/intermediaries'}>
            {labels.cancel}
          </Link>
        </Button>
      </div>
    </form>
  )
}
