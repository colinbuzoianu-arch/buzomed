'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { EmployeeSearchCombobox, type EmployeeResult } from '@/components/ui/employee-search-combobox'
import { toastSuccess, TOAST } from '@/lib/toast'

const ROUTE_LABELS: Record<string, string> = {
  intramuscular: 'Intramuscular',
  subcutaneous: 'Subcutanat',
  oral: 'Oral',
  intranasal: 'Intranazal',
  other: 'Altul',
}

const emptyForm = {
  vaccineName: '',
  vaccineCode: '',
  manufacturer: '',
  batchNumber: '',
  doseNumber: 1,
  administrationDate: new Date().toISOString().slice(0, 10),
  nextDoseDueDate: '',
  administrationRoute: '',
  injectionSite: '',
  reactionsObserved: '',
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

export function NewVaccinationModal({ onClose, onSuccess, preselectedEmployee }: Props) {
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeResult | null>(
    preselectedEmployee
      ? { ...preselectedEmployee, jobTitle: null, companyName: '' }
      : null
  )
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!selectedEmployee) { TOAST.error('Selectează un angajat.'); return }
    if (!form.vaccineName.trim()) { TOAST.error('Numele vaccinului este obligatoriu.'); return }
    if (!form.administrationDate) { TOAST.error('Data administrării este obligatorie.'); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/employees/${selectedEmployee.id}/vaccinations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { TOAST.error(data.message ?? 'Eroare la salvare.'); return }
      toastSuccess('Vaccinare înregistrată.', `${selectedEmployee.lastName} ${selectedEmployee.firstName}`)
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
            <h2 className="text-[15px] font-medium text-foreground">Vaccinare nouă</h2>
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
              <div className="col-span-2 space-y-1.5">
                <label className={cls.label}>Vaccin *</label>
                <input className={cls.input} value={form.vaccineName} onChange={e => setForm(f => ({ ...f, vaccineName: e.target.value }))} placeholder="ex. Hepatita B" />
              </div>
              <div className="space-y-1.5">
                <label className={cls.label}>Producător</label>
                <input className={cls.input} value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className={cls.label}>Nr. lot</label>
                <input className={cls.input} value={form.batchNumber} onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className={cls.label}>Doza nr.</label>
                <input type="number" min={1} max={10} className={cls.input} value={form.doseNumber} onChange={e => setForm(f => ({ ...f, doseNumber: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <label className={cls.label}>Cale administrare</label>
                <select className={cls.input} value={form.administrationRoute} onChange={e => setForm(f => ({ ...f, administrationRoute: e.target.value }))}>
                  <option value="">— selectează —</option>
                  {Object.entries(ROUTE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={cls.label}>Data administrării *</label>
                <input type="date" className={cls.input} value={form.administrationDate} onChange={e => setForm(f => ({ ...f, administrationDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className={cls.label}>Doza următoare</label>
                <input type="date" className={cls.input} value={form.nextDoseDueDate} onChange={e => setForm(f => ({ ...f, nextDoseDueDate: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className={cls.label}>Reacții observate</label>
                <input className={cls.input} value={form.reactionsObserved} onChange={e => setForm(f => ({ ...f, reactionsObserved: e.target.value }))} placeholder="ex. Eritem local minor" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className={cls.label}>Note</label>
                <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-[hsl(var(--surface-muted))]/40">
            <Button variant="outline" size="sm" onClick={onClose}>Anulează</Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || !selectedEmployee}>
              {submitting ? 'Se salvează...' : 'Salvează vaccinarea'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
