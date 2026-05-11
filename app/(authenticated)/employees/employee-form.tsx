'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Shared form for create + edit of an Employee.
 *
 * Scope notes (session 4):
 *   - No CNP capture. The schema's cnpEncrypted/cnpHash require pgcrypto
 *     helpers that aren't built yet. The form offers passport / EU id
 *     card / other only.
 *   - No Workplace assignment. That's the next session — once Workplaces
 *     exist, employees gain a "Current workplace" picker here.
 */

const ID_DOCUMENT_TYPES = ['passport', 'eu_id_card', 'other'] as const
type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number]

export interface EmployeeFormValues {
  firstName: string
  lastName: string
  idDocumentType: IdDocumentType
  idDocumentNumber: string
  companyEmployeeId: string
  birthDate: string
  gender: '' | 'M' | 'F' | 'other'
  nationality: string
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  postalCode: string
  phone: string
  email: string
  emergencyContactName: string
  emergencyContactPhone: string
  emergencyContactRelationship: string
  bloodType: string
  notes: string
  isActive: boolean
}

export const emptyEmployeeFormValues: EmployeeFormValues = {
  firstName: '',
  lastName: '',
  idDocumentType: 'other',
  idDocumentNumber: '',
  companyEmployeeId: '',
  birthDate: '',
  gender: '',
  nationality: 'RO',
  addressLine1: '',
  addressLine2: '',
  city: '',
  county: '',
  postalCode: '',
  phone: '',
  email: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelationship: '',
  bloodType: '',
  notes: '',
  isActive: true,
}

export interface EmployeeFormLabels {
  sectionIdentity: string
  sectionContact: string
  sectionEmergency: string
  sectionMedical: string
  sectionStatus: string
  fieldFirstName: string
  fieldLastName: string
  fieldIdDocumentType: string
  fieldIdDocumentTypePassport: string
  fieldIdDocumentTypeEuId: string
  fieldIdDocumentTypeOther: string
  fieldIdDocumentTypeCnpDeferred: string
  fieldIdDocumentNumber: string
  fieldCompanyEmployeeId: string
  fieldBirthDate: string
  fieldGender: string
  fieldGenderM: string
  fieldGenderF: string
  fieldGenderOther: string
  fieldGenderUnspecified: string
  fieldNationality: string
  fieldAddress1: string
  fieldAddress2: string
  fieldCity: string
  fieldCounty: string
  fieldPostalCode: string
  fieldPhone: string
  fieldEmail: string
  fieldEmergencyName: string
  fieldEmergencyPhone: string
  fieldEmergencyRelationship: string
  fieldBloodType: string
  fieldNotes: string
  fieldIsActive: string
  required: string
  cnpNotice: string
  submitCreate: string
  submitUpdate: string
  submitting: string
  cancel: string
  errorMessage: string
}

interface Props {
  employeeId?: string
  initialValues?: EmployeeFormValues
  labels: EmployeeFormLabels
}

export function EmployeeForm({ employeeId, initialValues, labels }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [form, setForm] = useState<EmployeeFormValues>(
    initialValues ?? emptyEmployeeFormValues
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!employeeId

  function update<K extends keyof EmployeeFormValues>(
    key: K,
    value: EmployeeFormValues[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload: Record<string, unknown> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      idDocumentType: form.idDocumentType,
      isActive: form.isActive,
    }
    const stringFields: Array<keyof EmployeeFormValues> = [
      'idDocumentNumber',
      'companyEmployeeId',
      'nationality',
      'addressLine1',
      'addressLine2',
      'city',
      'county',
      'postalCode',
      'phone',
      'email',
      'emergencyContactName',
      'emergencyContactPhone',
      'emergencyContactRelationship',
      'bloodType',
      'notes',
    ]
    for (const f of stringFields) {
      const trimmed = (form[f] as string).trim()
      if (isEdit) {
        payload[f] = trimmed
      } else if (trimmed !== '') {
        payload[f] = trimmed
      }
    }

    // Gender: empty string in the form means "not specified" → null on edit,
    // omit on create.
    if (isEdit) {
      payload.gender = form.gender === '' ? null : form.gender
    } else if (form.gender !== '') {
      payload.gender = form.gender
    }

    const birthDateValue = form.birthDate.trim()
    if (isEdit) {
      payload.birthDate = birthDateValue || null
    } else if (birthDateValue !== '') {
      payload.birthDate = birthDateValue
    }

    try {
      const url = isEdit ? `/api/employees/${employeeId}` : '/api/employees'
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

      const newId: string | undefined = data.employee?.id
      startTransition(() => {
        if (isEdit) {
          router.push(`/employees/${employeeId}`)
        } else if (newId) {
          router.push(`/employees/${newId}`)
        } else {
          router.push('/employees')
        }
        router.refresh()
      })
    } catch (err) {
      console.error('Employee submit failed', err)
      setError(labels.errorMessage)
      setSubmitting(false)
    }
  }

  const canSubmit = form.firstName.trim() !== '' && form.lastName.trim() !== ''

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionIdentity}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="lastName">
              {labels.fieldLastName} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lastName"
              value={form.lastName}
              onChange={(e) => update('lastName', e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="firstName">
              {labels.fieldFirstName}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="firstName"
              value={form.firstName}
              onChange={(e) => update('firstName', e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="idDocumentType">{labels.fieldIdDocumentType}</Label>
            <select
              id="idDocumentType"
              value={form.idDocumentType}
              onChange={(e) =>
                update('idDocumentType', e.target.value as IdDocumentType)
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="passport">
                {labels.fieldIdDocumentTypePassport}
              </option>
              <option value="eu_id_card">
                {labels.fieldIdDocumentTypeEuId}
              </option>
              <option value="other">{labels.fieldIdDocumentTypeOther}</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {labels.fieldIdDocumentTypeCnpDeferred}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="idDocumentNumber">
              {labels.fieldIdDocumentNumber}
            </Label>
            <Input
              id="idDocumentNumber"
              value={form.idDocumentNumber}
              onChange={(e) => update('idDocumentNumber', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyEmployeeId">
              {labels.fieldCompanyEmployeeId}
            </Label>
            <Input
              id="companyEmployeeId"
              value={form.companyEmployeeId}
              onChange={(e) => update('companyEmployeeId', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birthDate">{labels.fieldBirthDate}</Label>
            <Input
              id="birthDate"
              type="date"
              value={form.birthDate}
              onChange={(e) => update('birthDate', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gender">{labels.fieldGender}</Label>
            <select
              id="gender"
              value={form.gender}
              onChange={(e) =>
                update('gender', e.target.value as EmployeeFormValues['gender'])
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{labels.fieldGenderUnspecified}</option>
              <option value="M">{labels.fieldGenderM}</option>
              <option value="F">{labels.fieldGenderF}</option>
              <option value="other">{labels.fieldGenderOther}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nationality">{labels.fieldNationality}</Label>
            <Input
              id="nationality"
              value={form.nationality}
              onChange={(e) => update('nationality', e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground italic">
          {labels.cnpNotice}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionContact}</h2>
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
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="email">{labels.fieldEmail}</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionEmergency}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="emergencyContactName">
              {labels.fieldEmergencyName}
            </Label>
            <Input
              id="emergencyContactName"
              value={form.emergencyContactName}
              onChange={(e) => update('emergencyContactName', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emergencyContactPhone">
              {labels.fieldEmergencyPhone}
            </Label>
            <Input
              id="emergencyContactPhone"
              value={form.emergencyContactPhone}
              onChange={(e) => update('emergencyContactPhone', e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="emergencyContactRelationship">
              {labels.fieldEmergencyRelationship}
            </Label>
            <Input
              id="emergencyContactRelationship"
              value={form.emergencyContactRelationship}
              onChange={(e) =>
                update('emergencyContactRelationship', e.target.value)
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionMedical}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bloodType">{labels.fieldBloodType}</Label>
            <Input
              id="bloodType"
              value={form.bloodType}
              onChange={(e) => update('bloodType', e.target.value)}
              placeholder="A+, O-, ..."
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
        <Button type="submit" disabled={submitting || !canSubmit}>
          {submitting
            ? labels.submitting
            : isEdit
              ? labels.submitUpdate
              : labels.submitCreate}
        </Button>
        <Button type="button" variant="outline" asChild disabled={submitting}>
          <Link
            href={isEdit ? `/employees/${employeeId}` : '/employees'}
          >
            {labels.cancel}
          </Link>
        </Button>
      </div>
    </form>
  )
}
