'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { EmployeeSearchCombobox, type EmployeeResult } from '@/components/ui/employee-search-combobox'
import { toastSuccess, TOAST } from '@/lib/toast'
import type { MedicalEventType, MedicalEventOutcome } from '@prisma/client'

const EVENT_TYPE_LABELS: Record<MedicalEventType, string> = {
  workplace_accident: 'Accident de muncă',
  sudden_illness: 'Îmbolnăvire bruscă',
  first_aid: 'Prim ajutor',
  evacuation: 'Evacuare medicală',
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

const cls = {
  input: 'w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40',
  label: 'text-[12px] font-medium text-[hsl(var(--text-muted))] uppercase tracking-[0.06em]',
}

interface Props {
  onClose: () => void
  onSuccess?: () => void
  preselectedEmployee?: { id: string; firstName: string; lastName: string } | null
}

export function NewMedicalEventModal({ onClose, onSuccess, preselectedEmployee }: Props) {
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeResult | null>(
    preselectedEmployee
      ? { ...preselectedEmployee, jobTitle: null, companyName: '' }
      : null
  )
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!selectedEmployee) { TOAST.error('Selectează un angajat.'); return }
    if (!form.eventType) { TOAST.error('Tipul evenimentului este obligatoriu.'); return }
    if (!form.occurredAt) { TOAST.error('Data și ora sunt obligatorii.'); return }
    if (!form.description.trim()) { TOAST.error('Descrierea este obligatorie.'); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/employees/${selectedEmployee.id}/medical-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          eventType: form.eventType || undefined,
          outcome: form.outcome || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { TOAST.error(data.message ?? 'Eroare la salvare.'); return }
      toastSuccess('Eveniment înregistrat.', `${selectedEmployee.lastName} ${selectedEmployee.firstName}`)
      onSuccess?.()
      onClose()
    } catch {
      TOAST.error('Eroare de conexiune.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-card rounded-xl border shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b bg-[hsl(var(--surface-muted))]/60">
            <h2 className="text-[15px] font-medium text-foreground">Eveniment medical nou</h2>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-[hsl(var(--text-faint))] hover:text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-muted))] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                <path d="M1 1l12 12M13 1L1 13"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Angajat */}
            <div className="space-y-1.5">
              <label className={cls.label}>Angajat *</label>
              {preselectedEmployee ? (
                <div className="h-9 flex items-center px-3 rounded-md border bg-[hsl(var(--surface-muted))] text-sm">
                  {preselectedEmployee.lastName} {preselectedEmployee.firstName}
                </div>
              ) : (
                <EmployeeSearchCombobox onSelect={setSelectedEmployee} placeholder="Caută după nume..." />
              )}
              {selectedEmployee && !preselectedEmployee && (
                <p className="text-[11px] text-emerald-600">
                  ✓ {selectedEmployee.lastName} {selectedEmployee.firstName}
                  {selectedEmployee.companyName ? ` · ${selectedEmployee.companyName}` : ''}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={cls.label}>Tip eveniment *</label>
                <select className={cls.input} value={form.eventType} onChange={e => setForm(f => ({ ...f, eventType: e.target.value as MedicalEventType }))}>
                  <option value="">— selectează —</option>
                  {(Object.entries(EVENT_TYPE_LABELS) as [MedicalEventType, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={cls.label}>Data și ora *</label>
                <input type="datetime-local" className={cls.input} value={form.occurredAt} onChange={e => setForm(f => ({ ...f, occurredAt: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className={cls.label}>Locație</label>
                <input className={cls.input} value={form.locationDescription} onChange={e => setForm(f => ({ ...f, locationDescription: e.target.value }))} placeholder="ex. Hala de producție, linia 3" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className={cls.label}>Descriere *</label>
                <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrie ce s-a întâmplat..." />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className={cls.label}>Acțiuni întreprinse</label>
                <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none" rows={2} value={form.actionsTaken} onChange={e => setForm(f => ({ ...f, actionsTaken: e.target.value }))} placeholder="ex. Prim ajutor acordat, chemat ambulanța..." />
              </div>
              <div className="space-y-1.5">
                <label className={cls.label}>Outcome</label>
                <select className={cls.input} value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value as MedicalEventOutcome }))}>
                  <option value="">— selectează —</option>
                  {(Object.entries(OUTCOME_LABELS) as [MedicalEventOutcome, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={cls.label}>Note outcome</label>
                <input className={cls.input} value={form.outcomeNotes} onChange={e => setForm(f => ({ ...f, outcomeNotes: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.requiresIthsReport}
                    onChange={e => setForm(f => ({ ...f, requiresIthsReport: e.target.checked }))}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="text-sm text-foreground">Necesită raport ITHS</span>
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-[hsl(var(--surface-muted))]/40">
            <Button variant="outline" size="sm" onClick={onClose}>Anulează</Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || !selectedEmployee || !form.eventType}>
              {submitting ? 'Se salvează...' : 'Salvează evenimentul'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
