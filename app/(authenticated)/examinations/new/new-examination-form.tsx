'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmployeeCombobox, type EmployeeSearchResult } from '@/components/employee-combobox'

interface WorkplaceOption {
  id: string
  name: string
  department: string | null
  companyName: string
}

interface ExaminationTypeOption {
  id: string
  code: string
  name: string
}

interface PractitionerOption {
  id: string
  label: string
}

interface Labels {
  sectionWhoWhat: string
  sectionContext: string
  fieldEmployee: string
  fieldEmployeePlaceholder: string
  fieldEmployeeSearchPlaceholder: string
  fieldEmployeeNoResults: string
  fieldEmployeeTypeMore: string
  fieldExaminationType: string
  fieldExaminationTypePlaceholder: string
  fieldPractitioner: string
  fieldScheduledAt: string
  fieldScheduledAtHelp: string
  fieldRequestSource: string
  fieldRequestSourceOptions: {
    none: string
    employer_request: string
    periodic_due: string
    employee_request: string
    legal_obligation: string
    other: string
  }
  fieldReferringDocument: string
  fieldNotes: string
  currentWorkplace: string
  fieldWorkplace: string
  workplaceNone: string
  workplaceRequired: string
  typeGroupHg355: string
  typeGroupSpecial: string
  submitCreate: string
  submitting: string
  cancel: string
  errorMessage: string
  required: string
}

interface Props {
  workplaces: WorkplaceOption[]
  examinationTypes: ExaminationTypeOption[]
  practitioners: PractitionerOption[]
  defaultPractitionerId?: string
  preselectedEmployeeId?: string
  labels: Labels
}

const HG355_CODES = new Set([
  'angajare',
  'control_periodic',
  'adaptare',
  'reluare_munca',
  'schimbare_loc_munca',
  'incetare_munca',
  'la_cerere',
  'supraveghere_medicala_speciala',
])

const SPECIAL_CODES = new Set([
  'protectia_maternitatii',
  'certificat_invatamant',
  'certificat_magistratura',
])

const REQUEST_SOURCES = [
  '',
  'employer_request',
  'periodic_due',
  'employee_request',
  'legal_obligation',
  'other',
] as const

export function NewExaminationForm({
  workplaces,
  examinationTypes,
  practitioners,
  defaultPractitionerId,
  preselectedEmployeeId,
  labels,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [employeeId, setEmployeeId] = useState(preselectedEmployeeId ?? '')
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSearchResult | null>(null)
  const [overrideWorkplaceId, setOverrideWorkplaceId] = useState('')
  const [examinationTypeId, setExaminationTypeId] = useState('')
  const [practitionerId, setPractitionerId] = useState(
    defaultPractitionerId && practitioners.some((p) => p.id === defaultPractitionerId)
      ? defaultPractitionerId
      : ''
  )
  const [scheduledAt, setScheduledAt] = useState('')
  const [requestSource, setRequestSource] = useState('')
  const [referringDocumentNumber, setReferringDocumentNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsWorkplace = selectedEmployee !== null && selectedEmployee.workplaceId === null

  function handleEmployeeIdChange(newId: string) {
    setEmployeeId(newId)
    setOverrideWorkplaceId('')
  }

  function handleEmployeeChange(emp: EmployeeSearchResult | null) {
    setSelectedEmployee(emp)
    setOverrideWorkplaceId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!employeeId || !examinationTypeId || !practitionerId) {
      setError(labels.errorMessage)
      return
    }
    if (needsWorkplace && !overrideWorkplaceId) {
      setError(labels.workplaceRequired)
      return
    }
    setSubmitting(true)
    setError(null)

    const payload: Record<string, unknown> = {
      employeeId,
      examinationTypeId,
      practitionerId,
    }
    if (needsWorkplace && overrideWorkplaceId) payload.workplaceId = overrideWorkplaceId
    if (scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString()
    if (requestSource) payload.requestSource = requestSource
    if (referringDocumentNumber.trim())
      payload.referringDocumentNumber = referringDocumentNumber.trim()
    if (notes.trim()) payload.notes = notes.trim()

    try {
      const response = await fetch('/api/examinations', {
        method: 'POST',
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
      const newId: string | undefined = data.examination?.id
      startTransition(() => {
        if (newId) router.push(`/examinations/${newId}`)
        else router.push('/examinations')
        router.refresh()
      })
    } catch (err) {
      console.error('Create examination failed', err)
      setError(labels.errorMessage)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionWhoWhat}</h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="employeeId">
              {labels.fieldEmployee}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <EmployeeCombobox
              value={employeeId}
              onChange={handleEmployeeIdChange}
              onEmployeeChange={handleEmployeeChange}
              placeholder={labels.fieldEmployeePlaceholder}
              searchPlaceholder={labels.fieldEmployeeSearchPlaceholder}
              noResultsText={labels.fieldEmployeeNoResults}
              typeMoreText={labels.fieldEmployeeTypeMore}
              disabled={submitting}
            />
            {selectedEmployee && selectedEmployee.workplaceId && (
              <p className="text-xs text-muted-foreground">
                {labels.currentWorkplace}:{' '}
                <span className="font-medium">
                  {selectedEmployee.workplaceName}
                </span>
                {selectedEmployee.workplaceDepartment
                  ? ` (${selectedEmployee.workplaceDepartment})`
                  : ''}{' '}
                — {selectedEmployee.companyName}
              </p>
            )}
            {needsWorkplace && (
              <div className="space-y-2 mt-2">
                <p className="text-xs text-amber-600">{labels.workplaceRequired}</p>
                <Label htmlFor="overrideWorkplaceId">
                  {labels.fieldWorkplace} <span className="text-destructive">*</span>
                </Label>
                <select
                  id="overrideWorkplaceId"
                  value={overrideWorkplaceId}
                  onChange={(e) => setOverrideWorkplaceId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">{labels.workplaceNone}</option>
                  {workplaces.map((wp) => (
                    <option key={wp.id} value={wp.id}>
                      {wp.companyName} / {wp.name}
                      {wp.department ? ` (${wp.department})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="examinationTypeId">
              {labels.fieldExaminationType}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Select
              value={examinationTypeId || undefined}
              onValueChange={setExaminationTypeId}
              required
            >
              <SelectTrigger id="examinationTypeId" className="w-full h-10">
                <SelectValue placeholder={labels.fieldExaminationTypePlaceholder} />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  <SelectLabel>{labels.typeGroupHg355}</SelectLabel>
                  {examinationTypes
                    .filter((tp) => HG355_CODES.has(tp.code) || !SPECIAL_CODES.has(tp.code))
                    .map((tp) => (
                      <SelectItem key={tp.id} value={tp.id}>
                        {tp.name}
                      </SelectItem>
                    ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>{labels.typeGroupSpecial}</SelectLabel>
                  {examinationTypes
                    .filter((tp) => SPECIAL_CODES.has(tp.code))
                    .map((tp) => (
                      <SelectItem key={tp.id} value={tp.id}>
                        {tp.name}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="practitionerId">
              {labels.fieldPractitioner}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <select
              id="practitionerId"
              value={practitionerId}
              onChange={(e) => setPractitionerId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="">—</option>
              {practitioners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{labels.sectionContext}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="scheduledAt">{labels.fieldScheduledAt}</Label>
            <Input
              id="scheduledAt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {labels.fieldScheduledAtHelp}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="requestSource">{labels.fieldRequestSource}</Label>
            <select
              id="requestSource"
              value={requestSource}
              onChange={(e) => setRequestSource(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {REQUEST_SOURCES.map((src) => (
                <option key={src} value={src}>
                  {
                    labels.fieldRequestSourceOptions[
                      (src || 'none') as keyof typeof labels.fieldRequestSourceOptions
                    ]
                  }
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="referringDocumentNumber">
              {labels.fieldReferringDocument}
            </Label>
            <Input
              id="referringDocumentNumber"
              value={referringDocumentNumber}
              onChange={(e) => setReferringDocumentNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">{labels.fieldNotes}</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={
            submitting ||
            !employeeId ||
            !examinationTypeId ||
            !practitionerId ||
            (needsWorkplace && !overrideWorkplaceId)
          }
        >
          {submitting ? labels.submitting : labels.submitCreate}
        </Button>
        <Button type="button" variant="outline" asChild disabled={submitting}>
          <Link href="/examinations">{labels.cancel}</Link>
        </Button>
      </div>
    </form>
  )
}
