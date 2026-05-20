'use client'

import { TOAST } from '@/lib/toast'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Shared form for create + edit of an Employee.
 *
 * Scope notes:
 *   - CNP capture is live (session 8). When idDocumentType=cnp, the
 *     idDocumentNumber field is treated as the CNP itself: validated
 *     client-side for length/format, validated server-side for checksum,
 *     then encrypted and hashed before storage. A real-time hint warns
 *     if the CNP's embedded birth date disagrees with the explicit
 *     birthDate field (warning only — not a hard block).
 *   - No Workplace assignment in this form. Assignments live on the
 *     employee detail page (session 5).
 */

const ID_DOCUMENT_TYPES = ['cnp', 'passport', 'eu_id_card', 'other'] as const
type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number]


export interface EmployeeFormValues {
  firstName: string
  lastName: string
  jobTitle: string
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
  jobTitle: '',
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
  fieldIdDocumentTypeCnp: string
  fieldIdDocumentTypePassport: string
  fieldIdDocumentTypeEuId: string
  fieldIdDocumentTypeOther: string
  fieldIdDocumentTypeCnpHint: string
  fieldIdDocumentNumber: string
  fieldCnp: string
  cnpBirthDateMismatch: string
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
  fieldJobTitle: string
  fieldJobTitlePlaceholder: string
  fieldIsActive: string
  sectionAssignment: string
  fieldCompany: string
  companyNone: string
  fieldCityPlaceholder: string
  fieldCompanyEmployeeIdSubtext: string
  required: string
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
  companies?: { id: string; name: string }[]
  currentCompanyId?: string | null
}

export function EmployeeForm({
  employeeId,
  initialValues,
  labels,
  companies,
  currentCompanyId,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [form, setForm] = useState<EmployeeFormValues>(
    initialValues ?? emptyEmployeeFormValues
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    currentCompanyId ?? ''
  )

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

    if (companies !== undefined) {
      if (isEdit) {
        payload.companyId = selectedCompanyId || null
      } else if (selectedCompanyId) {
        payload.companyId = selectedCompanyId
      }
    }
    const stringFields: Array<keyof EmployeeFormValues> = [
      'jobTitle',
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
      const savedName = data.employee
        ? `${data.employee.lastName} ${data.employee.firstName}`
        : ''
      TOAST.employeeSaved(savedName)

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
      {companies !== undefined && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{labels.sectionAssignment}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companySelect">{labels.fieldCompany}</Label>
              <select
                id="companySelect"
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{labels.companyNone}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle">{labels.fieldJobTitle}</Label>
              <Input
                id="jobTitle"
                value={form.jobTitle}
                onChange={(e) => update('jobTitle', e.target.value)}
                placeholder={labels.fieldJobTitlePlaceholder}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cityAssign">{labels.fieldCity}</Label>
              <Input
                id="cityAssign"
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                placeholder={labels.fieldCityPlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyEmployeeId">
                {labels.fieldCompanyEmployeeId}{' '}
                <span className="text-muted-foreground font-normal text-xs">
                  {labels.fieldCompanyEmployeeIdSubtext}
                </span>
              </Label>
              <Input
                id="companyEmployeeId"
                value={form.companyEmployeeId}
                onChange={(e) => update('companyEmployeeId', e.target.value)}
                placeholder="ex: 12345"
              />
            </div>
          </div>
        </section>
      )}

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
              <option value="cnp">
                {labels.fieldIdDocumentTypeCnp}
              </option>
              <option value="passport">
                {labels.fieldIdDocumentTypePassport}
              </option>
              <option value="eu_id_card">
                {labels.fieldIdDocumentTypeEuId}
              </option>
              <option value="other">{labels.fieldIdDocumentTypeOther}</option>
            </select>
            {form.idDocumentType === 'cnp' && (
              <p className="text-xs text-muted-foreground">
                {labels.fieldIdDocumentTypeCnpHint}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="idDocumentNumber">
              {form.idDocumentType === 'cnp'
                ? labels.fieldCnp
                : labels.fieldIdDocumentNumber}
            </Label>
            <Input
              id="idDocumentNumber"
              value={form.idDocumentNumber}
              onChange={(e) => update('idDocumentNumber', e.target.value)}
              maxLength={form.idDocumentType === 'cnp' ? 13 : undefined}
              inputMode={form.idDocumentType === 'cnp' ? 'numeric' : undefined}
              pattern={form.idDocumentType === 'cnp' ? '\\d{13}' : undefined}
              placeholder={
                form.idDocumentType === 'cnp' ? '1234567890123' : undefined
              }
            />
            {form.idDocumentType === 'cnp' && form.idDocumentNumber && (
              <CnpBirthDateMismatchHint
                cnp={form.idDocumentNumber}
                birthDate={form.birthDate}
                label={labels.cnpBirthDateMismatch}
              />
            )}
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

/**
 * Small helper component: when CNP and birthDate are both present, check
 * whether the CNP's embedded birth date matches and surface a warning if
 * not. Warning only — the user may legitimately have an off-by-day mismatch
 * (immigrant CNPs, historical data quirks). Hard validation lives on the
 * server.
 *
 * We do the parse inline rather than importing from lib/crypto so the
 * client bundle stays tiny — the cipher and hash modules are server-side
 * only.
 */
function CnpBirthDateMismatchHint({
  cnp,
  birthDate,
  label,
}: {
  cnp: string
  birthDate: string
  label: string
}) {
  if (!cnp || cnp.length !== 13 || !/^\d{13}$/.test(cnp) || !birthDate) {
    return null
  }
  const s = parseInt(cnp[0], 10)
  let centuryBase: number | null = null
  if (s === 1 || s === 2 || s === 7 || s === 8 || s === 9) centuryBase = 1900
  else if (s === 3 || s === 4) centuryBase = 1800
  else if (s === 5 || s === 6) centuryBase = 2000
  if (centuryBase === null) return null
  const yy = parseInt(cnp.slice(1, 3), 10)
  const mm = parseInt(cnp.slice(3, 5), 10)
  const dd = parseInt(cnp.slice(5, 7), 10)
  const year = centuryBase + yy
  // Compose ISO date string YYYY-MM-DD for comparison with form value.
  const cnpDateStr = `${String(year).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  if (cnpDateStr === birthDate) return null
  return (
    <p className="text-xs text-amber-700 dark:text-amber-400">
      {label.replace('{cnpDate}', cnpDateStr)}
    </p>
  )
}
