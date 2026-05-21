'use client'

import { useState, useTransition, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toastSuccess, toastError } from '@/lib/toast'
import { ArrowLeft, Loader2, Upload, Trash2 } from 'lucide-react'

interface Practitioner {
  id: string
  firstName: string
  lastName: string
  professionalTitle: string | null
  specialty: string | null
  professionalCode: string | null
  stampImageUrl: string | null
  signatureImageUrl: string | null
}

interface Props {
  practitioner: Practitioner
  canEdit: boolean
}

export function PractitionerSettingsClient({ practitioner, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [professionalTitle, setProfessionalTitle] = useState(practitioner.professionalTitle ?? '')
  const [specialty, setSpecialty] = useState(practitioner.specialty ?? '')
  const [professionalCode, setProfessionalCode] = useState(practitioner.professionalCode ?? '')

  const [stampUrl, setStampUrl] = useState<string | null>(practitioner.stampImageUrl)
  const [stampUploading, setStampUploading] = useState(false)
  const [stampDeleting, setStampDeleting] = useState(false)
  const stampInputRef = useRef<HTMLInputElement>(null)

  const [signatureUrl, setSignatureUrl] = useState<string | null>(practitioner.signatureImageUrl)
  const [signatureUploading, setSignatureUploading] = useState(false)
  const [signatureDeleting, setSignatureDeleting] = useState(false)
  const signatureInputRef = useRef<HTMLInputElement>(null)

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/settings/practitioners/${practitioner.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ professionalTitle, specialty, professionalCode }),
        })
        const json = await res.json()
        if (!res.ok) {
          toastError(json.error ?? 'Eroare la salvare.')
          return
        }
        toastSuccess('Profil salvat')
        router.refresh()
      } catch {
        toastError('Eroare de rețea.')
      }
    })
  }

  async function handleStampUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStampUploading(true)
    try {
      const fd = new FormData()
      fd.append('stamp', file)
      const res = await fetch(`/api/settings/practitioners/${practitioner.id}/stamp`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        toastError(json.error ?? 'Eroare la încărcare.')
      } else {
        setStampUrl(json.stampImageUrl)
        toastSuccess('Ștampilă actualizată')
        router.refresh()
      }
    } catch {
      toastError('Eroare de rețea.')
    } finally {
      setStampUploading(false)
      if (stampInputRef.current) stampInputRef.current.value = ''
    }
  }

  async function handleSignatureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSignatureUploading(true)
    try {
      const fd = new FormData()
      fd.append('signature', file)
      const res = await fetch(`/api/settings/practitioners/${practitioner.id}/signature`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        toastError(json.error ?? 'Eroare la încărcare.')
      } else {
        setSignatureUrl(json.signatureImageUrl)
        toastSuccess('Semnătură actualizată')
        router.refresh()
      }
    } catch {
      toastError('Eroare de rețea.')
    } finally {
      setSignatureUploading(false)
      if (signatureInputRef.current) signatureInputRef.current.value = ''
    }
  }

  async function handleSignatureDelete() {
    if (!confirm('Ștergi semnătura?')) return
    setSignatureDeleting(true)
    try {
      const res = await fetch(`/api/settings/practitioners/${practitioner.id}/signature`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        toastError('Eroare la ștergere.')
      } else {
        setSignatureUrl(null)
        toastSuccess('Semnătură eliminată')
        router.refresh()
      }
    } catch {
      toastError('Eroare de rețea.')
    } finally {
      setSignatureDeleting(false)
    }
  }

  async function handleStampDelete() {
    if (!confirm('Ștergi ștampila?')) return
    setStampDeleting(true)
    try {
      const res = await fetch(`/api/settings/practitioners/${practitioner.id}/stamp`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        toastError('Eroare la ștergere.')
      } else {
        setStampUrl(null)
        toastSuccess('Ștampilă eliminată')
        router.refresh()
      }
    } catch {
      toastError('Eroare de rețea.')
    } finally {
      setStampDeleting(false)
    }
  }

  return (
    <div className="space-y-8 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/settings/practice">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Înapoi
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">
          {practitioner.lastName} {practitioner.firstName}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Profil medic</p>
      </div>

      {/* ── Professional details ────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="font-semibold text-base">Date profesionale</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Apar în antet la rubrica semnătură.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="professionalTitle">Titlu profesional</Label>
          <Input
            id="professionalTitle"
            value={professionalTitle}
            onChange={(e) => setProfessionalTitle(e.target.value)}
            placeholder="Ex: Medic specialist / Medic primar"
            maxLength={100}
            disabled={!canEdit}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="specialty">Specialitate</Label>
          <Input
            id="specialty"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="Ex: Medicină muncii"
            maxLength={200}
            disabled={!canEdit}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="professionalCode">Cod parafă</Label>
          <Input
            id="professionalCode"
            value={professionalCode}
            onChange={(e) => setProfessionalCode(e.target.value)}
            placeholder="Ex: MM12345"
            maxLength={20}
            disabled={!canEdit}
          />
          <p className="text-xs text-muted-foreground">
            Codul de identificare din Registrul Colegiului Medicilor.
          </p>
        </div>

        {canEdit && (
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Se salvează...
                </>
              ) : (
                'Salvează'
              )}
            </Button>
          </div>
        )}
      </section>

      {/* ── Stamp ──────────────────────────────────────────────────── */}
      {canEdit && (
        <section className="space-y-4">
          <div className="border-b pb-2">
            <h2 className="font-semibold text-base">Ștampilă</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Apare în zona de semnătură a fișei de aptitudine PDF. Max 2 MB · PNG, JPG, WebP.
            </p>
          </div>

          <div className="flex items-start gap-6">
            <div className="w-32 h-20 border rounded-lg flex items-center justify-center bg-muted/30 flex-shrink-0 overflow-hidden">
              {stampUrl ? (
                <Image
                  src={stampUrl}
                  alt="Ștampilă"
                  width={120}
                  height={72}
                  className="object-contain max-w-full max-h-full"
                />
              ) : (
                <span className="text-xs text-muted-foreground text-center px-2">
                  Nicio ștampilă
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input
                ref={stampInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={handleStampUpload}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => stampInputRef.current?.click()}
                disabled={stampUploading}
              >
                {stampUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {stampUrl ? 'Înlocuiește ștampila' : 'Încarcă ștampilă'}
              </Button>

              {stampUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleStampDelete}
                  disabled={stampDeleting}
                >
                  {stampDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Elimină ștampila
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Signature ──────────────────────────────────────────────── */}
      {canEdit && (
        <section className="space-y-4">
          <div className="border-b pb-2">
            <h2 className="font-semibold text-base">Semnătură</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Imaginea semnăturii olografe. Apare pe documente PDF generate. Max 2 MB · PNG, JPG, WebP.
            </p>
          </div>

          <div className="flex items-start gap-6">
            <div className="w-32 h-20 border rounded-lg flex items-center justify-center bg-muted/30 flex-shrink-0 overflow-hidden">
              {signatureUrl ? (
                <Image
                  src={signatureUrl}
                  alt="Semnătură"
                  width={120}
                  height={72}
                  className="object-contain max-w-full max-h-full"
                />
              ) : (
                <span className="text-xs text-muted-foreground text-center px-2">
                  Nicio semnătură
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input
                ref={signatureInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={handleSignatureUpload}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => signatureInputRef.current?.click()}
                disabled={signatureUploading}
              >
                {signatureUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {signatureUrl ? 'Înlocuiește semnătura' : 'Încarcă semnătură'}
              </Button>

              {signatureUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleSignatureDelete}
                  disabled={signatureDeleting}
                >
                  {signatureDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Elimină semnătura
                </Button>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
