'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sandboxT as t } from '@/lib/sandbox/i18n'
import { useSandboxStore } from '@/lib/sandbox/store'

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

/**
 * Sandbox new-examination form. Mirrors the real form's layout and fields
 * using the same UI primitives, but with a plain fixture-employee picker
 * instead of the API-driven combobox, and sandbox-local navigation. Creating
 * posts through the fetch shim (→ store) and opens the new exam.
 */
export default function SandboxNewExaminationPage() {
  const { data } = useSandboxStore()
  const router = useRouter()

  // Only employees that already have a workplace — keeps the demo one-step
  // (the real form asks for a workplace when one is missing).
  const employees = useMemo(
    () =>
      data.employees
        .filter((e) => e.workplaceId && e.archivedAt === null)
        .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)),
    [data]
  )
  const companyById = useMemo(() => new Map(data.companies.map((c) => [c.id, c])), [data])

  const [employeeId, setEmployeeId] = useState('')
  const [examinationTypeId, setExaminationTypeId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!employeeId || !examinationTypeId) {
      setError(t('examinations.form.errorMessage'))
      return
    }
    setSubmitting(true)
    setError(null)
    const payload: Record<string, unknown> = {
      employeeId,
      examinationTypeId,
      practitionerId: data.practitioner.id,
    }
    if (scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString()
    if (notes.trim()) payload.notes = notes.trim()

    try {
      const res = await fetch('/api/examinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          (body.issues as string[] | undefined)?.join('; ') || t('examinations.form.errorMessage')
        )
        setSubmitting(false)
        return
      }
      const newId = body.examination?.id as string | undefined
      router.push(newId ? `/sandbox/examinations/${newId}` : '/sandbox/examinations')
    } catch {
      setError(t('examinations.form.errorMessage'))
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t('nav.examinations'), href: '/sandbox/examinations' },
          { label: t('examinations.newButton') },
        ]}
      />
      <h1 className="font-display text-[28px] sm:text-[32px] font-normal tracking-tight">
        {t('examinations.newButton')}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
        <section className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="employeeId">
              Angajat <span className="text-destructive">*</span>
            </Label>
            <select
              id="employeeId"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={SELECT_CLASS}
              required
            >
              <option value="">—</option>
              {employees.map((emp) => {
                const company = emp.companyId ? companyById.get(emp.companyId) : undefined
                return (
                  <option key={emp.id} value={emp.id}>
                    {emp.lastName} {emp.firstName}
                    {company ? ` — ${company.name}` : ''}
                    {emp.jobTitle ? ` (${emp.jobTitle})` : ''}
                  </option>
                )
              })}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="examinationTypeId">
              Tip examinare <span className="text-destructive">*</span>
            </Label>
            <select
              id="examinationTypeId"
              value={examinationTypeId}
              onChange={(e) => setExaminationTypeId(e.target.value)}
              className={SELECT_CLASS}
              required
            >
              <option value="">—</option>
              {data.examinationTypes.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.nameRo}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="scheduledAt">Programare</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('examinations.form.fieldNotes')}</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </section>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={submitting || !employeeId || !examinationTypeId}>
            {submitting ? t('examinations.form.saving') : t('examinations.newButton')}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/sandbox/examinations">{t('examinations.revoke.cancel')}</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
