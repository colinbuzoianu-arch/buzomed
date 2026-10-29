'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toastError, toastSuccess } from '@/lib/toast'

export interface WorkSiteRow {
  id: string
  name: string
  addressLine1: string | null
  city: string | null
  county: string | null
  isActive: boolean
  workplaceCount: number
}

interface Props {
  companyId: string
  canWrite: boolean
  initialSites: WorkSiteRow[]
  locale: string
}

interface FormState {
  name: string
  addressLine1: string
  city: string
  county: string
}

const emptyForm: FormState = { name: '', addressLine1: '', city: '', county: '' }

// The cabinet UI across this app keeps its microcopy inline (see the contacts
// section). A tiny ro/en map keeps the two supported locales honest without a
// server round-trip for labels in a client component.
function dict(locale: string) {
  const en = locale === 'en'
  return {
    sectionTitle: en ? 'Work sites' : 'Puncte de lucru',
    help: en
      ? 'Territorial units (branch / site). A workplace can belong to one.'
      : 'Unități teritoriale (sucursală / punct). Un loc de muncă poate aparține unuia.',
    add: en ? '+ Add site' : '+ Adaugă punct',
    empty: en ? 'No work sites yet.' : 'Niciun punct de lucru încă.',
    name: en ? 'Name' : 'Denumire',
    address: en ? 'Address' : 'Adresă',
    city: en ? 'City' : 'Oraș',
    county: en ? 'County' : 'Județ',
    workplaces: en ? 'workplaces' : 'locuri de muncă',
    inactive: en ? 'inactive' : 'inactiv',
    edit: en ? 'Edit' : 'Editează',
    activate: en ? 'Activate' : 'Activează',
    deactivate: en ? 'Deactivate' : 'Dezactivează',
    del: en ? 'Delete' : 'Șterge',
    newTitle: en ? 'New work site' : 'Punct de lucru nou',
    editTitle: en ? 'Edit work site' : 'Editează punctul de lucru',
    save: en ? 'Save' : 'Salvează',
    cancel: en ? 'Cancel' : 'Anulează',
    saving: en ? 'Saving…' : 'Se salvează…',
    createdOk: en ? 'Work site created.' : 'Punct de lucru creat.',
    savedOk: en ? 'Work site saved.' : 'Punct de lucru salvat.',
    deletedOk: en ? 'Work site deleted.' : 'Punct de lucru șters.',
    inUse: en
      ? 'This site still has workplaces. Deactivate it instead.'
      : 'Acest punct are locuri de muncă. Dezactivează-l în loc să-l ștergi.',
    genericErr: en ? 'Something went wrong.' : 'A apărut o eroare.',
    confirmDelete: en ? 'Delete this work site?' : 'Ștergi acest punct de lucru?',
  }
}

export function WorkSitesSection({ companyId, canWrite, initialSites, locale }: Props) {
  const router = useRouter()
  const L = dict(locale)
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)

  function openNew() {
    setEditingId(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(site: WorkSiteRow) {
    setEditingId(site.id)
    setForm({
      name: site.name,
      addressLine1: site.addressLine1 ?? '',
      city: site.city ?? '',
      county: site.county ?? '',
    })
    setOpen(true)
  }

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function submit() {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const url = editingId
        ? `/api/companies/${companyId}/work-sites/${editingId}`
        : `/api/companies/${companyId}/work-sites`
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          addressLine1: form.addressLine1.trim(),
          city: form.city.trim(),
          county: form.county.trim(),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toastError(data.message || L.genericErr)
        return
      }
      toastSuccess(editingId ? L.savedOk : L.createdOk)
      setOpen(false)
      refresh()
    } catch {
      toastError(L.genericErr)
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(site: WorkSiteRow) {
    setBusy(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/work-sites/${site.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !site.isActive }),
      })
      if (!res.ok) {
        toastError(L.genericErr)
        return
      }
      toastSuccess(L.savedOk)
      refresh()
    } catch {
      toastError(L.genericErr)
    } finally {
      setBusy(false)
    }
  }

  async function remove(site: WorkSiteRow) {
    if (!window.confirm(L.confirmDelete)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/work-sites/${site.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toastError(data.error === 'in_use' ? L.inUse : data.message || L.genericErr)
        return
      }
      toastSuccess(L.deletedOk)
      refresh()
    } catch {
      toastError(L.genericErr)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            {L.sectionTitle}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({initialSites.length})
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">{L.help}</p>
        </div>
        {canWrite && (
          <Button size="sm" type="button" onClick={openNew}>
            {L.add}
          </Button>
        )}
      </div>

      {initialSites.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-lg px-4 py-3">{L.empty}</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {initialSites.map((s) => {
            const addr = [s.addressLine1, s.city, s.county].filter(Boolean).join(', ')
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {s.name}
                    {!s.isActive && (
                      <span className="text-xs text-muted-foreground font-normal">({L.inactive})</span>
                    )}
                  </div>
                  {addr && <div className="text-xs text-muted-foreground truncate">{addr}</div>}
                  <div className="text-xs text-muted-foreground">
                    {s.workplaceCount} {L.workplaces}
                  </div>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" type="button" onClick={() => openEdit(s)}>
                      {L.edit}
                    </Button>
                    <Button size="sm" variant="ghost" type="button" onClick={() => toggleActive(s)} disabled={busy}>
                      {s.isActive ? L.deactivate : L.activate}
                    </Button>
                    {s.workplaceCount === 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        className="text-destructive"
                        onClick={() => remove(s)}
                        disabled={busy}
                      >
                        {L.del}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? L.editTitle : L.newTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ws-name">
                {L.name} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ws-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ws-address">{L.address}</Label>
              <Input
                id="ws-address"
                value={form.addressLine1}
                onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ws-city">{L.city}</Label>
                <Input
                  id="ws-city"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ws-county">{L.county}</Label>
                <Input
                  id="ws-county"
                  value={form.county}
                  onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={busy}>
              {L.cancel}
            </Button>
            <Button type="button" onClick={submit} disabled={busy || !form.name.trim()}>
              {busy ? L.saving : L.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
