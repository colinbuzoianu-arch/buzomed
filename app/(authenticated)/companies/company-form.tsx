'use client'

import { TOAST } from '@/lib/toast'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAnafLookup, type AnafCompanyData } from '@/hooks/useAnafLookup'

/**
 * Shared form for create + edit of a Company.
 *
 * Mode is implicit: if `companyId` is given, we PATCH; otherwise we POST.
 * The labels object is pre-translated server-side so this component
 * doesn't need direct access to next-intl / i18n state.
 */

export interface CompanyFormValues {
  name: string
  cui: string
  registrationNumber: string
  caenCode: string
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  postalCode: string
  phone: string
  email: string
  website: string
  contactPersonName: string
  contactPersonRole: string
  contactPersonPhone: string
  contactPersonEmail: string
  contractStartDate: string
  contractEndDate: string
  notes: string
  isActive: boolean
}

export const emptyCompanyFormValues: CompanyFormValues = {
  name: '',
  cui: '',
  registrationNumber: '',
  caenCode: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  county: '',
  postalCode: '',
  phone: '',
  email: '',
  website: '',
  contactPersonName: '',
  contactPersonRole: '',
  contactPersonPhone: '',
  contactPersonEmail: '',
  contractStartDate: '',
  contractEndDate: '',
  notes: '',
  isActive: true,
}

export interface CompanyFormLabels {
  sectionInfo: string
  sectionAddress: string
  sectionContact: string
  sectionContract: string
  sectionStatus: string
  fieldName: string
  fieldNamePlaceholder: string
  fieldCui: string
  fieldRegistration: string
  fieldCaenCode: string
  fieldAddress1: string
  fieldAddress2: string
  fieldCity: string
  fieldCounty: string
  fieldPostalCode: string
  fieldPhone: string
  fieldEmail: string
  fieldWebsite: string
  fieldContactPersonName: string
  fieldContactPersonRole: string
  fieldContactPersonPhone: string
  fieldContactPersonEmail: string
  fieldContractStart: string
  fieldContractEnd: string
  fieldNotes: string
  fieldIsActive: string
  required: string
  submitCreate: string
  submitUpdate: string
  submitting: string
  cancel: string
  successCreate: string
  successUpdate: string
  errorMessage: string
  anafFound: string
  anafInactive: string
  anafPlatitorTva: string
}

interface Props {
  companyId?: string
  initialValues?: CompanyFormValues
  labels: CompanyFormLabels
}

export function CompanyForm({ companyId, initialValues, labels }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [form, setForm] = useState<CompanyFormValues>(
    initialValues ?? emptyCompanyFormValues
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!companyId

  const handleAnafSuccess = useCallback((data: AnafCompanyData) => {
    setForm((prev) => ({
      ...prev,
      name: data.denumire || prev.name,
      registrationNumber: data.nrRegCom || prev.registrationNumber,
      caenCode: data.codCaen || prev.caenCode,
      addressLine1: data.adresa || prev.addressLine1,
      postalCode: data.codPostal || prev.postalCode,
      phone: data.telefon || prev.phone,
    }))
  }, [])

  const { lookup, data: anafData, status: anafStatus, error: anafError } = useAnafLookup(handleAnafSuccess)

  function update<K extends keyof CompanyFormValues>(
    key: K,
    value: CompanyFormValues[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    // Build payload: trim strings, send empty strings for clearable
    // fields on edit so the server interprets them as "clear this".
    // On create, drop empty strings entirely so we don't ship a wall
    // of `null` values.
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      isActive: form.isActive,
    }
    const stringFields: Array<keyof CompanyFormValues> = [
      'cui',
      'registrationNumber',
      'caenCode',
      'addressLine1',
      'addressLine2',
      'city',
      'county',
      'postalCode',
      'phone',
      'email',
      'website',
      'contactPersonName',
      'contactPersonRole',
      'contactPersonPhone',
      'contactPersonEmail',
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
    for (const f of ['contractStartDate', 'contractEndDate'] as const) {
      const value = form[f].trim()
      if (isEdit) {
        payload[f] = value || null
      } else if (value !== '') {
        payload[f] = value
      }
    }

    try {
      const url = isEdit ? `/api/companies/${companyId}` : '/api/companies'
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

      const companyId2: string | undefined = data.company?.id
      TOAST.companySaved(data.company?.name ?? '')
      startTransition(() => {
        if (isEdit) {
          router.push(`/companies/${companyId}`)
        } else if (companyId2) {
          router.push(`/companies/${companyId2}`)
        } else {
          router.push('/companies')
        }
        router.refresh()
      })
    } catch (err) {
      console.error('Company submit failed', err)
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
            {anafStatus === 'idle' && (
              <p className="text-xs text-muted-foreground">
                Introdu CUI-ul și datele firmei se vor completa automat din ANAF
              </p>
            )}
            {anafStatus === 'loading' && (
              <p className="text-xs text-muted-foreground">
                Introdu CUI-ul și datele firmei se vor completa automat din ANAF
              </p>
            )}
            {anafStatus === 'found' && (
              <p className="text-xs text-green-700">{labels.anafFound}</p>
            )}
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
            <Label htmlFor="registrationNumber">
              {labels.fieldRegistration}
            </Label>
            <Input
              id="registrationNumber"
              value={form.registrationNumber}
              onChange={(e) => update('registrationNumber', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="caenCode" className="flex items-center gap-2">
              {labels.fieldCaenCode}
              {anafData?.platitorTva && (
                <span className="inline-flex items-center rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                  {labels.anafPlatitorTva}
                </span>
              )}
            </Label>
            <Input
              id="caenCode"
              value={form.caenCode}
              onChange={(e) => update('caenCode', e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionAddress}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="addressLine1">{labels.fieldAddress1}</Label>
            <Input
              id="addressLine1"
              value={form.addressLine1}
              onChange={(e) => update('addressLine1', e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="addressLine2">{labels.fieldAddress2}</Label>
            <Input
              id="addressLine2"
              value={form.addressLine2}
              onChange={(e) => update('addressLine2', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">{labels.fieldCity}</Label>
            <Input
              id="city"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
            />
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
            <Label htmlFor="postalCode">{labels.fieldPostalCode}</Label>
            <Input
              id="postalCode"
              value={form.postalCode}
              onChange={(e) => update('postalCode', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{labels.fieldPhone}</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{labels.fieldEmail}</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">{labels.fieldWebsite}</Label>
            <Input
              id="website"
              value={form.website}
              onChange={(e) => update('website', e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionContact}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="contactPersonName">
              {labels.fieldContactPersonName}
            </Label>
            <Input
              id="contactPersonName"
              value={form.contactPersonName}
              onChange={(e) => update('contactPersonName', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPersonRole">
              {labels.fieldContactPersonRole}
            </Label>
            <Input
              id="contactPersonRole"
              value={form.contactPersonRole}
              onChange={(e) => update('contactPersonRole', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPersonPhone">
              {labels.fieldContactPersonPhone}
            </Label>
            <Input
              id="contactPersonPhone"
              value={form.contactPersonPhone}
              onChange={(e) => update('contactPersonPhone', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPersonEmail">
              {labels.fieldContactPersonEmail}
            </Label>
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
        <h2 className="text-xl font-semibold">{labels.sectionContract}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="contractStartDate">
              {labels.fieldContractStart}
            </Label>
            <Input
              id="contractStartDate"
              type="date"
              value={form.contractStartDate}
              onChange={(e) => update('contractStartDate', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contractEndDate">{labels.fieldContractEnd}</Label>
            <Input
              id="contractEndDate"
              type="date"
              value={form.contractEndDate}
              onChange={(e) => update('contractEndDate', e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">{labels.fieldNotes}</Label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
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
          {submitting
            ? labels.submitting
            : isEdit
              ? labels.submitUpdate
              : labels.submitCreate}
        </Button>
        <Button type="button" variant="outline" asChild disabled={submitting}>
          <Link
            href={isEdit ? `/companies/${companyId}` : '/companies'}
          >
            {labels.cancel}
          </Link>
        </Button>
      </div>
    </form>
  )
}
