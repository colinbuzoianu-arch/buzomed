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
import { toastError, toastSuccess } from '@/lib/toast'

interface Props {
  companyId: string
  locale: string
}

interface Candidate {
  id: string
  label: string
}

function dict(locale: string) {
  const en = locale === 'en'
  return {
    trigger: en ? 'Clean up empty' : 'Curăță locurile goale',
    title: en
      ? 'Deactivate workplaces with no active employees'
      : 'Dezactivează locurile de muncă fără angajați activi',
    intro: en
      ? 'These active workplaces have no employee currently assigned. Deactivating keeps all their examinations and recalls — it only hides them from new assignments.'
      : 'Aceste locuri de muncă active nu au niciun angajat alocat momentan. Dezactivarea păstrează toate examinările și scadențele — doar le ascunde la alocări noi.',
    none: en
      ? 'No empty workplaces — nothing to deactivate.'
      : 'Niciun loc de muncă gol — nimic de dezactivat.',
    confirm: en ? 'Deactivate {n}' : 'Dezactivează {n}',
    cancel: en ? 'Cancel' : 'Anulează',
    working: en ? 'Working…' : 'Se procesează…',
    doneOne: en ? 'Deactivated {n} workplace.' : 'Un loc de muncă dezactivat.',
    done: en ? 'Deactivated {n} workplaces.' : '{n} locuri de muncă dezactivate.',
    err: en ? 'Something went wrong.' : 'A apărut o eroare.',
  }
}

export function DeactivateEmptyWorkplacesButton({ companyId, locale }: Props) {
  const router = useRouter()
  const L = dict(locale)
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])

  async function openPreview() {
    setOpen(true)
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/workplaces/deactivate-empty`)
      if (!res.ok) {
        toastError(L.err)
        setOpen(false)
        return
      }
      const data = await res.json()
      setCandidates(Array.isArray(data.workplaces) ? data.workplaces : [])
    } catch {
      toastError(L.err)
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  async function confirm() {
    setBusy(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/workplaces/deactivate-empty`, {
        method: 'POST',
      })
      if (!res.ok) {
        toastError(L.err)
        return
      }
      const data = await res.json()
      const n = Number(data.deactivated ?? 0)
      toastSuccess((n === 1 ? L.doneOne : L.done).replace('{n}', String(n)))
      setOpen(false)
      startTransition(() => router.refresh())
    } catch {
      toastError(L.err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" type="button" onClick={openPreview}>
        {L.trigger}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{L.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{L.intro}</p>
          {loading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm">{L.none}</p>
          ) : (
            <ul className="max-h-64 overflow-auto border rounded-lg divide-y text-sm">
              {candidates.map((c) => (
                <li key={c.id} className="px-3 py-2">
                  {c.label}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={busy}>
              {L.cancel}
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={busy || loading || candidates.length === 0}
            >
              {busy ? L.working : L.confirm.replace('{n}', String(candidates.length))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
