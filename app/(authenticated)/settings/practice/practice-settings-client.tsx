'use client'

import { useState, useTransition, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toastSuccess, toastError } from '@/lib/toast'
import { useAnafLookup } from '@/hooks/useAnafLookup'
import { Loader2, Upload, Trash2, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react'

interface Tenant {
  id: string
  name: string
  legalName: string | null
  cui: string | null
  registrationNumber: string | null
  addressLine1: string | null
  phone: string | null
  email: string | null
  logoUrl: string | null
}

interface Practitioner {
  id: string
  firstName: string
  lastName: string
  professionalTitle: string | null
  specialty: string | null
  professionalCode: string | null
  stampImageUrl: string | null
}

interface Props {
  tenant: Tenant
  practitioners: Practitioner[]
}

export function PracticeSettingsClient({ tenant, practitioners }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ── Identity form state ──────────────────────────────────────────────
  const [name, setName] = useState(tenant.name ?? '')
  const [legalName, setLegalName] = useState(tenant.legalName ?? '')
  const [cui, setCui] = useState(tenant.cui ?? '')
  const [regCom, setRegCom] = useState(tenant.registrationNumber ?? '')
  const [addressLine1, setAddressLine1] = useState(tenant.addressLine1 ?? '')
  const [phone, setPhone] = useState(tenant.phone ?? '')
  const [email, setEmail] = useState(tenant.email ?? '')

  // ── Logo state ───────────────────────────────────────────────────────
  const [logoUrl, setLogoUrl] = useState<string | null>(tenant.logoUrl)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoDeleting, setLogoDeleting] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // ── ANAF lookup ──────────────────────────────────────────────────────
  const handleAnafSuccess = useCallback(
    (data: { denumire: string; adresa: string; nrRegCom: string }) => {
      if (data.denumire) setLegalName(data.denumire)
      if (data.adresa) setAddressLine1(data.adresa)
      if (data.nrRegCom) setRegCom(data.nrRegCom)
      toastSuccess('Date ANAF preluate', data.denumire)
    },
    []
  )
  const anaf = useAnafLookup(handleAnafSuccess)

  // ── Save identity ────────────────────────────────────────────────────
  function handleSaveIdentity() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/settings/practice', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, legalName, cui, regCom, addressLine1, phone, email }),
        })
        const json = await res.json()
        if (!res.ok) {
          toastError(json.error ?? 'Eroare la salvare.')
          return
        }
        toastSuccess('Setări salvate')
        router.refresh()
      } catch {
        toastError('Eroare de rețea.')
      }
    })
  }

  // ── Logo upload ──────────────────────────────────────────────────────
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('logo', file)
      const res = await fetch('/api/settings/practice/logo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        toastError(json.error ?? 'Eroare la încărcare.')
      } else {
        setLogoUrl(json.logoUrl)
        toastSuccess('Logo actualizat')
        router.refresh()
      }
    } catch {
      toastError('Eroare de rețea.')
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  // ── Logo delete ──────────────────────────────────────────────────────
  async function handleLogoDelete() {
    if (!confirm('Ștergi logo-ul cabinetului?')) return
    setLogoDeleting(true)
    try {
      const res = await fetch('/api/settings/practice/logo', { method: 'DELETE' })
      if (!res.ok) {
        toastError('Eroare la ștergere.')
      } else {
        setLogoUrl(null)
        toastSuccess('Logo eliminat')
        router.refresh()
      }
    } catch {
      toastError('Eroare de rețea.')
    } finally {
      setLogoDeleting(false)
    }
  }

  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Setări cabinet</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Informații afișate pe fișele de aptitudine și documentele oficiale.
        </p>
      </div>

      {/* ── Section 1: Identitate ─────────────────────────────────────── */}
      <section className="space-y-5">
        <div className="border-b pb-2">
          <h2 className="font-semibold text-base">Identitate cabinet</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Denumire scurtă (afișaj)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Cabinet Dr. Ionescu"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="legalName">Denumire legală</Label>
            <Input
              id="legalName"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Ex: SC Ionescu Medical SRL"
              maxLength={200}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cui">CUI / CIF</Label>
            <div className="flex gap-2">
              <Input
                id="cui"
                value={cui}
                onChange={(e) => {
                  setCui(e.target.value)
                  anaf.lookup(e.target.value)
                }}
                placeholder="Ex: 12345678"
                maxLength={20}
                className="flex-1"
              />
              {anaf.status === 'loading' && (
                <span className="flex items-center px-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </span>
              )}
              {anaf.status === 'found' && (
                <span className="flex items-center px-2 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              )}
              {anaf.status === 'error' && (
                <span className="flex items-center px-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                </span>
              )}
            </div>
            {anaf.status === 'found' && (
              <p className="text-xs text-green-600">Date ANAF preluate automat.</p>
            )}
            {anaf.status === 'inactive' && (
              <p className="text-xs text-amber-600">CUI inactiv în ANAF.</p>
            )}
            {anaf.status === 'error' && (
              <p className="text-xs text-destructive">{anaf.error}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="regCom">Nr. Reg. Com.</Label>
            <Input
              id="regCom"
              value={regCom}
              onChange={(e) => setRegCom(e.target.value)}
              placeholder="Ex: J40/1234/2020"
              maxLength={50}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="addressLine1">Adresă</Label>
          <Input
            id="addressLine1"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            placeholder="Stradă, număr, oraș, județ"
            maxLength={300}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefon</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex: 0721 000 000"
              maxLength={50}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email cabinet</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ex: cabinet@exemplu.ro"
              maxLength={200}
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSaveIdentity} disabled={isPending}>
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
      </section>

      {/* ── Section 2: Logo ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="font-semibold text-base">Logo cabinet</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Apare în antetul fișei de aptitudine PDF. Max 2 MB · PNG, JPG, SVG, WebP.
          </p>
        </div>

        <div className="flex items-start gap-6">
          {/* Preview */}
          <div className="w-32 h-20 border rounded-lg flex items-center justify-center bg-muted/30 flex-shrink-0 overflow-hidden">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Logo cabinet"
                width={120}
                height={72}
                className="object-contain max-w-full max-h-full"
              />
            ) : (
              <span className="text-xs text-muted-foreground text-center px-2">
                Niciun logo
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoInputRef.current?.click()}
              disabled={logoUploading}
            >
              {logoUploading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {logoUrl ? 'Înlocuiește logo' : 'Încarcă logo'}
            </Button>

            {logoUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleLogoDelete}
                disabled={logoDeleting}
              >
                {logoDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Elimină logo
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ── Section 3: Practitioners ──────────────────────────────────── */}
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="font-semibold text-base">Profil medici</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Titlu profesional, specialitate, parafa și ștampilă pentru fișa de aptitudine.
          </p>
        </div>

        {practitioners.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nu există medici activi în cabinet.
          </p>
        ) : (
          <div className="divide-y border rounded-lg overflow-hidden">
            {practitioners.map((p) => (
              <Link
                key={p.id}
                href={`/settings/practitioners/${p.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors group"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">
                    {p.lastName} {p.firstName}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {[p.professionalTitle, p.specialty].filter(Boolean).join(' · ') || (
                      <span className="italic">Profil incomplet</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  {p.stampImageUrl ? (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Ștampilă
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Fără ștampilă
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
