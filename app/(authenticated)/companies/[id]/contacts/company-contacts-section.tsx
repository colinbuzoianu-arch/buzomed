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

type ContactRole = 'hr' | 'ssm' | 'plant_manager' | 'shift_supervisor' | 'lab' | 'billing' | 'other'

export interface CompanyContact {
  id: string
  companyId: string
  name: string
  role: ContactRole
  roleNote: string | null
  phone: string | null
  email: string | null
  isPrimary: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

const ROLE_LABELS: Record<ContactRole, string> = {
  hr: 'HR',
  ssm: 'SSM / HSE',
  plant_manager: 'Manager producție',
  shift_supervisor: 'Șef tură',
  lab: 'Laborator',
  billing: 'Contabilitate',
  other: 'Altul',
}

const ALL_ROLES: ContactRole[] = [
  'hr',
  'ssm',
  'plant_manager',
  'shift_supervisor',
  'lab',
  'billing',
  'other',
]

interface FormState {
  name: string
  role: ContactRole
  roleNote: string
  phone: string
  email: string
  isPrimary: boolean
  notes: string
}

const emptyForm: FormState = {
  name: '',
  role: 'hr',
  roleNote: '',
  phone: '',
  email: '',
  isPrimary: false,
  notes: '',
}

interface Props {
  companyId: string
  initialContacts: CompanyContact[]
  canWrite: boolean
}

export function CompanyContactsSection({ companyId, initialContacts, canWrite }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [contacts, setContacts] = useState<CompanyContact[]>(initialContacts)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogError(null)
    setDialogOpen(true)
  }

  function openEdit(c: CompanyContact) {
    setEditingId(c.id)
    setForm({
      name: c.name,
      role: c.role,
      roleNote: c.roleNote ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      isPrimary: c.isPrimary,
      notes: c.notes ?? '',
    })
    setDialogError(null)
    setDialogOpen(true)
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setDialogError(null)
    setSubmitting(true)

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      role: form.role,
      isPrimary: form.isPrimary,
    }
    // Send empty strings so server clears nullable fields on edit
    payload.roleNote = form.roleNote.trim() || (editingId ? '' : undefined)
    payload.phone = form.phone.trim() || (editingId ? '' : undefined)
    payload.email = form.email.trim() || (editingId ? '' : undefined)
    payload.notes = form.notes.trim() || (editingId ? '' : undefined)

    // roleNote only relevant for role=other; clear it for other roles
    if (form.role !== 'other') {
      payload.roleNote = editingId ? '' : undefined
    }

    try {
      const url = editingId
        ? `/api/companies/${companyId}/contacts/${editingId}`
        : `/api/companies/${companyId}/contacts`
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => ({}))) as {
        contact?: CompanyContact
        issues?: string[]
        message?: string
        error?: string
      }

      if (!res.ok) {
        const msg =
          data.issues?.join('; ') ||
          data.message ||
          data.error ||
          'A apărut o eroare. Încearcă din nou.'
        setDialogError(msg)
        setSubmitting(false)
        return
      }

      const saved = data.contact
      if (!saved) {
        setDialogError('Răspuns neașteptat de la server.')
        setSubmitting(false)
        return
      }

      if (editingId) {
        // If we set isPrimary=true, demote all others in local state
        setContacts((prev) =>
          prev.map((c) => {
            if (c.id === editingId) return saved
            if (saved.isPrimary) return { ...c, isPrimary: false }
            return c
          })
        )
        toastSuccess('Contact actualizat')
      } else {
        setContacts((prev) => {
          const updated = saved.isPrimary ? prev.map((c) => ({ ...c, isPrimary: false })) : prev
          return [...updated, saved].sort((a, b) => {
            if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
            return a.createdAt < b.createdAt ? -1 : 1
          })
        })
        toastSuccess('Contact adăugat')
      }

      setDialogOpen(false)
      startTransition(() => router.refresh())
    } catch {
      setDialogError('A apărut o eroare. Încearcă din nou.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(contact: CompanyContact) {
    if (!confirm(`Șterge contactul „${contact.name}"?`)) return
    setDeletingId(contact.id)
    try {
      const res = await fetch(`/api/companies/${companyId}/contacts/${contact.id}`, {
        method: 'DELETE',
      })
      const data = (await res.json().catch(() => ({}))) as {
        message?: string
        error?: string
      }
      if (!res.ok) {
        toastError(data.message || data.error || 'Eroare la ștergere')
        return
      }
      setContacts((prev) => prev.filter((c) => c.id !== contact.id))
      toastSuccess('Contact șters')
      startTransition(() => router.refresh())
    } catch {
      toastError('Eroare la ștergere')
    } finally {
      setDeletingId(null)
    }
  }

  function roleLabel(c: CompanyContact) {
    if (c.role === 'other' && c.roleNote) return c.roleNote
    return ROLE_LABELS[c.role]
  }

  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Contacte{' '}
            <span className="text-sm font-normal text-muted-foreground">({contacts.length})</span>
          </h2>
          {canWrite && (
            <Button size="sm" onClick={openAdd}>
              + Adaugă contact
            </Button>
          )}
        </div>

        {contacts.length === 0 ? (
          <div className="border rounded-lg px-4 py-6 text-center text-sm text-muted-foreground">
            Niciun contact adăugat încă.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Nume</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Rol</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Telefon
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Email</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                      Principal
                    </th>
                    {canWrite && (
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                        Acțiuni
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {contacts.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{roleLabel(c)}</td>
                      <td className="px-4 py-3">
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} className="text-primary hover:underline">
                            {c.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="text-primary hover:underline">
                            {c.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.isPrimary && (
                          <span className="inline-flex items-center rounded-full border border-[#1a3a5c]/30 bg-[#1a3a5c]/10 px-2 py-0.5 text-[11px] font-medium text-[#1a3a5c]">
                            Principal
                          </span>
                        )}
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(c)}
                              className="text-muted-foreground hover:text-foreground transition-colors p-1"
                              title="Editează"
                            >
                              ✏
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(c)}
                              disabled={deletingId === c.id}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1 disabled:opacity-50"
                              title="Șterge"
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {contacts.map((c) => (
                <div key={c.id} className="border rounded-lg px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{c.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{roleLabel(c)}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.isPrimary && (
                        <span className="inline-flex items-center rounded-full border border-[#1a3a5c]/30 bg-[#1a3a5c]/10 px-2 py-0.5 text-[11px] font-medium text-[#1a3a5c]">
                          Principal
                        </span>
                      )}
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="text-muted-foreground hover:text-foreground p-1"
                          >
                            ✏
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            disabled={deletingId === c.id}
                            className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-50"
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {(c.phone || c.email) && (
                    <div className="text-sm space-y-0.5">
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="block text-primary hover:underline">
                          {c.phone}
                        </a>
                      )}
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          className="block text-primary hover:underline"
                        >
                          {c.email}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!submitting) {
            setDialogOpen(o)
            if (!o) setDialogError(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editează contact' : 'Adaugă contact'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="contact-name">
                Nume <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contact-name"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                maxLength={200}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-role">
                Rol <span className="text-destructive">*</span>
              </Label>
              <select
                id="contact-role"
                value={form.role}
                onChange={(e) => update('role', e.target.value as ContactRole)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>

            {form.role === 'other' && (
              <div className="space-y-2">
                <Label htmlFor="contact-role-note">Detaliere rol</Label>
                <Input
                  id="contact-role-note"
                  value={form.roleNote}
                  onChange={(e) => update('roleNote', e.target.value)}
                  maxLength={100}
                  placeholder="ex. Manager QA"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact-phone">Telefon</Label>
                <Input
                  id="contact-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  maxLength={40}
                  placeholder="+40 7xx xxx xxx"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  maxLength={200}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-notes">Note</Label>
              <textarea
                id="contact-notes"
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                maxLength={500}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isPrimary}
                onChange={(e) => update('isPrimary', e.target.checked)}
              />
              <span className="text-sm">Contact principal</span>
            </label>

            {dialogError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {dialogError}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Anulează
              </Button>
              <Button type="submit" disabled={submitting || !form.name.trim()}>
                {submitting ? 'Se salvează...' : 'Salvează'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
