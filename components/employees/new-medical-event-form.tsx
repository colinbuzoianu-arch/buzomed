'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TOAST, toastSuccess } from '@/lib/toast'

type MedicalEventType = 'workplace_accident' | 'sudden_illness' | 'first_aid' | 'evacuation' | 'other'
type MedicalEventOutcome = 'fully_recovered' | 'partially_recovered' | 'hospitalized' | 'deceased' | 'ongoing_treatment' | 'other'

interface Employee {
  id: string
  firstName: string
  lastName: string
  company: { name: string } | null
}

interface Props {
  employees: Employee[]
  locale: 'ro' | 'en'
}

const EVENT_TYPE_LABELS: Record<MedicalEventType, string> = {
  workplace_accident: 'Accident de muncă',
  sudden_illness: 'Îmbolnăvire bruscă',
  first_aid: 'Prim ajutor',
  evacuation: 'Evacuare',
  other: 'Altul',
}

const OUTCOME_LABELS: Record<MedicalEventOutcome, string> = {
  fully_recovered: 'Vindecat complet',
  partially_recovered: 'Vindecat parțial',
  hospitalized: 'Spitalizat',
  deceased: 'Decedat',
  ongoing_treatment: 'Tratament în curs',
  other: 'Altul',
}

const emptyForm = {
  employeeId: '',
  eventType: '' as MedicalEventType | '',
  occurredAt: new Date().toISOString().slice(0, 16),
  locationDescription: '',
  description: '',
  actionsTaken: '',
  outcome: '' as MedicalEventOutcome | '',
  outcomeNotes: '',
  requiresIthsReport: false,
  ithsReportNumber: '',
  injuryDescription: '',
  daysLost: '',
  notes: '',
}

const inputCls = 'w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40'
const labelCls = 'text-[12px] text-[hsl(var(--text-muted))]'

export function NewMedicalEventForm({ employees }: Props) {
  const router = useRouter()
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!form.employeeId) { TOAST.error('Selectează un angajat.'); return }
    if (!form.eventType) { TOAST.error('Selectează tipul evenimentului.'); return }
    if (!form.occurredAt) { TOAST.error('Data evenimentului este obligatorie.'); return }
    if (!form.description.trim()) { TOAST.error('Descrierea este obligatorie.'); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/employees/${form.employeeId}/medical-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          eventType: form.eventType || undefined,
          outcome: form.outcome || undefined,
          daysLost: form.daysLost ? Number(form.daysLost) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { TOAST.error(data.message ?? 'Eroare la salvare.'); return }
      toastSuccess('Eveniment înregistrat.')
      router.push('/medical-events')
    } catch {
      TOAST.error('Eroare de conexiune.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border bg-[hsl(var(--surface-muted))]/40 p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Employee */}
        <div className="space-y-1 sm:col-span-2">
          <label className={labelCls}>Angajat *</label>
          <select
            className={inputCls}
            value={form.employeeId}
            onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
          >
            <option value="">— selectează angajat —</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.lastName} {emp.firstName}{emp.company ? ` — ${emp.company.name}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Event type */}
        <div className="space-y-1">
          <label className={labelCls}>Tip eveniment *</label>
          <select
            className={inputCls}
            value={form.eventType}
            onChange={e => setForm(f => ({ ...f, eventType: e.target.value as MedicalEventType }))}
          >
            <option value="">— selectează —</option>
            {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div className="space-y-1">
          <label className={labelCls}>Data și ora *</label>
          <input
            type="datetime-local"
            className={inputCls}
            value={form.occurredAt}
            onChange={e => setForm(f => ({ ...f, occurredAt: e.target.value }))}
          />
        </div>

        {/* Location */}
        <div className="space-y-1">
          <label className={labelCls}>Locație</label>
          <input
            className={inputCls}
            value={form.locationDescription}
            onChange={e => setForm(f => ({ ...f, locationDescription: e.target.value }))}
            placeholder="ex. Hala de producție nr. 2"
          />
        </div>

        {/* Outcome */}
        <div className="space-y-1">
          <label className={labelCls}>Outcome</label>
          <select
            className={inputCls}
            value={form.outcome}
            onChange={e => setForm(f => ({ ...f, outcome: e.target.value as MedicalEventOutcome }))}
          >
            <option value="">— selectează —</option>
            {Object.entries(OUTCOME_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="space-y-1 sm:col-span-2">
          <label className={labelCls}>Descriere *</label>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
            rows={3}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Descrieți pe scurt evenimentul medical..."
          />
        </div>

        {/* Actions taken */}
        <div className="space-y-1 sm:col-span-2">
          <label className={labelCls}>Acțiuni întreprinse</label>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
            rows={2}
            value={form.actionsTaken}
            onChange={e => setForm(f => ({ ...f, actionsTaken: e.target.value }))}
            placeholder="ex. Prim ajutor acordat, transport la spital..."
          />
        </div>

        {/* Outcome notes */}
        <div className="space-y-1">
          <label className={labelCls}>Note outcome</label>
          <input
            className={inputCls}
            value={form.outcomeNotes}
            onChange={e => setForm(f => ({ ...f, outcomeNotes: e.target.value }))}
          />
        </div>

        {/* General notes */}
        <div className="space-y-1">
          <label className={labelCls}>Note generale</label>
          <input
            className={inputCls}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>

        {/* Requires ITHS report */}
        <div className="sm:col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="requiresIthsGlobal"
            checked={form.requiresIthsReport}
            onChange={e => setForm(f => ({ ...f, requiresIthsReport: e.target.checked }))}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="requiresIthsGlobal" className="text-sm text-[hsl(var(--text-muted))]">
            Necesită raport ITHS
          </label>
        </div>

        {/* ITHS report number — shown only when requiresIthsReport */}
        {form.requiresIthsReport && (
          <div className="space-y-1">
            <label className={labelCls}>Număr raport ITM</label>
            <input
              className={inputCls}
              value={form.ithsReportNumber}
              onChange={e => setForm(f => ({ ...f, ithsReportNumber: e.target.value }))}
              placeholder="ex. ITM-BV-2026-001234"
            />
          </div>
        )}

        {/* Accident-specific fields */}
        {form.eventType === 'workplace_accident' && (
          <>
            <div className="space-y-1 sm:col-span-2">
              <label className={labelCls}>Natura leziunii</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                rows={2}
                value={form.injuryDescription}
                onChange={e => setForm(f => ({ ...f, injuryDescription: e.target.value }))}
                placeholder="ex. Fractură membru superior stâng..."
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Zile incapacitate de muncă</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                value={form.daysLost}
                onChange={e => setForm(f => ({ ...f, daysLost: e.target.value }))}
                placeholder="0"
              />
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={() => router.push('/medical-events')} disabled={submitting}>
          Anulează
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Se salvează...' : 'Salvează eveniment'}
        </Button>
      </div>
    </div>
  )
}
