'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format-date'
import { toastSuccess, TOAST } from '@/lib/toast'

type Vaccination = {
  id: string
  vaccineName: string
  vaccineCode: string | null
  manufacturer: string | null
  batchNumber: string | null
  doseNumber: number
  administrationDate: string
  nextDoseDueDate: string | null
  administrationRoute: string | null
  injectionSite: string | null
  reactionsObserved: string | null
  notes: string | null
  administeredBy: { firstName: string; lastName: string }
  examination: { id: string; examinationNumber: string } | null
}

interface Props {
  employeeId: string
  canWrite: boolean
  locale: 'ro' | 'en'
}

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

export function VaccinationsTab({ employeeId, canWrite, locale }: Props) {
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    fetch(`/api/employees/${employeeId}/vaccinations`)
      .then(r => r.json())
      .then(d => setVaccinations(d.vaccinations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [employeeId])

  async function handleSubmit() {
    if (!form.vaccineName.trim() || !form.administrationDate) {
      TOAST.error('Numele vaccinului și data sunt obligatorii.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/vaccinations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { TOAST.error(data.message ?? 'Eroare.'); return }
      setVaccinations(prev => [data.vaccination, ...prev])
      setShowForm(false)
      setForm(emptyForm)
      toastSuccess('Vaccinare înregistrată.')
    } catch { TOAST.error('Eroare de conexiune.') }
    finally { setSubmitting(false) }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Ștergi vaccinarea "${name}"?`)) return
    const res = await fetch(`/api/employees/${employeeId}/vaccinations/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setVaccinations(prev => prev.filter(v => v.id !== id))
      toastSuccess('Vaccinare ștearsă.')
    } else {
      TOAST.error('Eroare la ștergere.')
    }
  }

  if (loading) return <div className="py-8 text-center text-sm text-[hsl(var(--text-muted))]">Se încarcă...</div>

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" variant={showForm ? 'outline' : 'default'} onClick={() => setShowForm(f => !f)}>
            {showForm ? 'Anulează' : '+ Adaugă vaccinare'}
          </Button>
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border bg-[hsl(var(--surface-muted))]/40 p-4 space-y-3">
          <h3 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--text-muted))]">
            Vaccinare nouă
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Vaccin *</label>
              <input
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.vaccineName}
                onChange={e => setForm(f => ({ ...f, vaccineName: e.target.value }))}
                placeholder="ex. Hepatita B"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Cod vaccin</label>
              <input
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.vaccineCode}
                onChange={e => setForm(f => ({ ...f, vaccineCode: e.target.value }))}
                placeholder="ex. HEPB"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Producător</label>
              <input
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.manufacturer}
                onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Nr. lot</label>
              <input
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.batchNumber}
                onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Doza nr.</label>
              <input
                type="number"
                min={1}
                max={10}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.doseNumber}
                onChange={e => setForm(f => ({ ...f, doseNumber: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Cale administrare</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.administrationRoute}
                onChange={e => setForm(f => ({ ...f, administrationRoute: e.target.value }))}
              >
                <option value="">— selectează —</option>
                {Object.entries(ROUTE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Data administrării *</label>
              <input
                type="date"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.administrationDate}
                onChange={e => setForm(f => ({ ...f, administrationDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Data doză următoare</label>
              <input
                type="date"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.nextDoseDueDate}
                onChange={e => setForm(f => ({ ...f, nextDoseDueDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Reacții observate</label>
              <input
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.reactionsObserved}
                onChange={e => setForm(f => ({ ...f, reactionsObserved: e.target.value }))}
                placeholder="ex. Eritem local minor"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[12px] text-[hsl(var(--text-muted))]">Note</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
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

      {vaccinations.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-[hsl(var(--surface-muted))]/40 py-10 text-center">
          <p className="text-sm text-[hsl(var(--text-muted))]">Nicio vaccinare înregistrată.</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {vaccinations.map(v => {
            const isDue = v.nextDoseDueDate && new Date(v.nextDoseDueDate) <= new Date()
            return (
              <div key={v.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{v.vaccineName}</span>
                      {v.vaccineCode && (
                        <span className="text-[10px] font-mono text-[hsl(var(--text-faint))] border rounded px-1">
                          {v.vaccineCode}
                        </span>
                      )}
                      <span className="text-[11px] text-[hsl(var(--text-muted))]">Doza {v.doseNumber}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[12px] text-[hsl(var(--text-muted))]">
                      <span>{formatDate(v.administrationDate, 'medium', locale)}</span>
                      {v.manufacturer && <span>{v.manufacturer}</span>}
                      {v.batchNumber && <span>Lot: {v.batchNumber}</span>}
                      {v.administrationRoute && <span>{ROUTE_LABELS[v.administrationRoute] ?? v.administrationRoute}</span>}
                      {v.administeredBy && (
                        <span>Dr. {v.administeredBy.lastName} {v.administeredBy.firstName}</span>
                      )}
                    </div>
                    {v.nextDoseDueDate && (
                      <div className={`mt-1 text-[11px] font-medium ${isDue ? 'text-amber-600' : 'text-[hsl(var(--text-muted))]'}`}>
                        Doză următoare: {formatDate(v.nextDoseDueDate, 'medium', locale)}
                        {isDue && ' ⚠ Scadentă'}
                      </div>
                    )}
                    {v.reactionsObserved && (
                      <div className="mt-1 text-[11px] text-amber-600">Reacții: {v.reactionsObserved}</div>
                    )}
                    {v.notes && (
                      <div className="mt-1 text-[11px] text-[hsl(var(--text-faint))] italic">{v.notes}</div>
                    )}
                  </div>
                  {canWrite && (
                    <button
                      onClick={() => handleDelete(v.id, v.vaccineName)}
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
            )
          })}
        </div>
      )}
    </div>
  )
}
