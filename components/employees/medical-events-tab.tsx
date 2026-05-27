'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format-date'
import { toastSuccess, TOAST } from '@/lib/toast'

type MedicalEventType = 'workplace_accident' | 'sudden_illness' | 'first_aid' | 'evacuation' | 'other'
type MedicalEventOutcome = 'fully_recovered' | 'partially_recovered' | 'hospitalized' | 'deceased' | 'ongoing_treatment' | 'other'

type MedicalEvent = {
  id: string
  eventType: MedicalEventType
  occurredAt: string
  locationDescription: string | null
  description: string
  actionsTaken: string | null
  outcome: MedicalEventOutcome | null
  outcomeNotes: string | null
  requiresIthsReport: boolean
  ithsReportFiled: boolean
  notes: string | null
  practitioner: { firstName: string; lastName: string } | null
  company: { name: string } | null
}

interface Props {
  employeeId: string
  canWrite: boolean
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
  eventType: '' as MedicalEventType | '',
  occurredAt: new Date().toISOString().slice(0, 16),
  locationDescription: '',
  description: '',
  actionsTaken: '',
  outcome: '' as MedicalEventOutcome | '',
  outcomeNotes: '',
  requiresIthsReport: false,
  notes: '',
}

export function MedicalEventsTab({ employeeId, canWrite, locale }: Props) {
  const [events, setEvents] = useState<MedicalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [markingId, setMarkingId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/employees/${employeeId}/medical-events`)
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [employeeId])

  async function handleSubmit() {
    if (!form.description.trim() || !form.eventType || !form.occurredAt) {
      TOAST.error('Descrierea, tipul evenimentului și data sunt obligatorii.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/medical-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          eventType: form.eventType || undefined,
          outcome: form.outcome || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { TOAST.error(data.message ?? 'Eroare.'); return }
      setEvents(prev => [data.event, ...prev])
      setShowForm(false)
      setForm(emptyForm)
      toastSuccess('Eveniment înregistrat.')
    } catch { TOAST.error('Eroare de conexiune.') }
    finally { setSubmitting(false) }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Ștergi acest eveniment medical?')) return
    const res = await fetch(`/api/employees/${employeeId}/medical-events/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setEvents(prev => prev.filter(e => e.id !== id))
      toastSuccess('Eveniment șters.')
    } else {
      TOAST.error('Eroare la ștergere.')
    }
  }

  async function handleMarkIths(id: string) {
    setMarkingId(id)
    try {
      const res = await fetch(`/api/employees/${employeeId}/medical-events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ithsReportFiled: true }),
      })
      if (res.ok) {
        setEvents(prev => prev.map(e => e.id === id ? { ...e, ithsReportFiled: true } : e))
        toastSuccess('Raport ITHS marcat ca depus.')
      } else {
        TOAST.error('Eroare la actualizare.')
      }
    } catch { TOAST.error('Eroare de conexiune.') }
    finally { setMarkingId(null) }
  }

  if (loading) return <div className="py-8 text-center text-sm text-[hsl(var(--text-muted))]">Se încarcă...</div>

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" variant={showForm ? 'outline' : 'default'} onClick={() => setShowForm(f => !f)}>
            {showForm ? 'Anulează' : '+ Adaugă eveniment'}
          </Button>
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border bg-[hsl(var(--surface-muted))]/40 p-4 space-y-3">
          <h3 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
            Eveniment medical nou
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Tip eveniment *</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.eventType}
                onChange={e => setForm(f => ({ ...f, eventType: e.target.value as MedicalEventType }))}
              >
                <option value="">— selectează —</option>
                {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Data și ora *</label>
              <input
                type="datetime-local"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.occurredAt}
                onChange={e => setForm(f => ({ ...f, occurredAt: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Locație</label>
              <input
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.locationDescription}
                onChange={e => setForm(f => ({ ...f, locationDescription: e.target.value }))}
                placeholder="ex. Hala de producție nr. 2"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Outcome</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.outcome}
                onChange={e => setForm(f => ({ ...f, outcome: e.target.value as MedicalEventOutcome }))}
              >
                <option value="">— selectează —</option>
                {Object.entries(OUTCOME_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Descriere *</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descrieți pe scurt evenimentul medical..."
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Acțiuni întreprinse</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                rows={2}
                value={form.actionsTaken}
                onChange={e => setForm(f => ({ ...f, actionsTaken: e.target.value }))}
                placeholder="ex. Prim ajutor acordat, transport la spital..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Note outcome</label>
              <input
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.outcomeNotes}
                onChange={e => setForm(f => ({ ...f, outcomeNotes: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Note generale</label>
              <input
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="requiresIths"
                checked={form.requiresIthsReport}
                onChange={e => setForm(f => ({ ...f, requiresIthsReport: e.target.checked }))}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="requiresIths" className="text-sm text-[hsl(var(--text-muted))]">
                Necesită raport ITHS
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Anulează</Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Se salvează...' : 'Salvează'}
            </Button>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-[hsl(var(--surface-muted))]/40 py-10 text-center">
          <p className="text-sm text-[hsl(var(--text-muted))]">Niciun eveniment medical înregistrat.</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {events.map(ev => (
            <div key={ev.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {EVENT_TYPE_LABELS[ev.eventType] ?? ev.eventType}
                    </span>
                    {ev.requiresIthsReport && !ev.ithsReportFiled && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        Necesită raport ITHS
                      </span>
                    )}
                    {ev.ithsReportFiled && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                        Raport ITHS depus
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[12px] text-[hsl(var(--text-muted))]">
                    <span>{formatDate(ev.occurredAt, 'medium', locale)}</span>
                    {ev.locationDescription && <span>{ev.locationDescription}</span>}
                    {ev.outcome && <span>{OUTCOME_LABELS[ev.outcome] ?? ev.outcome}</span>}
                    {ev.company && <span>{ev.company.name}</span>}
                    {ev.practitioner && (
                      <span>Dr. {ev.practitioner.lastName} {ev.practitioner.firstName}</span>
                    )}
                  </div>
                  {ev.description && (
                    <div className="mt-1 text-[12px] text-[hsl(var(--text-muted))] whitespace-pre-wrap">
                      {ev.description}
                    </div>
                  )}
                  {ev.actionsTaken && (
                    <div className="mt-1 text-[11px] text-[hsl(var(--text-faint))] italic">
                      Acțiuni: {ev.actionsTaken}
                    </div>
                  )}
                  {ev.outcomeNotes && (
                    <div className="mt-1 text-[11px] text-[hsl(var(--text-faint))] italic">
                      {ev.outcomeNotes}
                    </div>
                  )}
                  {ev.notes && (
                    <div className="mt-1 text-[11px] text-[hsl(var(--text-faint))] italic">{ev.notes}</div>
                  )}
                  {canWrite && ev.requiresIthsReport && !ev.ithsReportFiled && (
                    <button
                      onClick={() => handleMarkIths(ev.id)}
                      disabled={markingId === ev.id}
                      className="mt-2 text-[11px] text-amber-700 hover:text-amber-900 underline disabled:opacity-50"
                    >
                      {markingId === ev.id ? 'Se marchează...' : 'Marchează raport depus'}
                    </button>
                  )}
                </div>
                {canWrite && (
                  <button
                    onClick={() => handleDelete(ev.id)}
                    className="shrink-0 text-[hsl(var(--text-faint))] hover:text-red-500 transition-colors p-1 rounded"
                    title="Șterge"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 2l10 10M12 2L2 12"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
