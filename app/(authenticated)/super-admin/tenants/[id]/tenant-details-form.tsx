'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toastSuccess, toastError } from '@/lib/toast'
import { useAnafLookup } from '@/hooks/useAnafLookup'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface DetailsLabels {
  title: string
  help: string
  name: string
  legalName: string
  cui: string
  regCom: string
  email: string
  phone: string
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  postalCode: string
  save: string
  saving: string
  success: string
  error: string
  anafFound: string
  anafInactive: string
}

interface Props {
  tenantId: string
  labels: DetailsLabels
  current: {
    name: string | null
    legalName: string | null
    cui: string | null
    registrationNumber: string | null
    email: string | null
    phone: string | null
    addressLine1: string | null
    addressLine2: string | null
    city: string | null
    county: string | null
    postalCode: string | null
  }
}

export function TenantDetailsForm({ tenantId, labels, current }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState(current.name ?? '')
  const [legalName, setLegalName] = useState(current.legalName ?? '')
  const [cui, setCui] = useState(current.cui ?? '')
  const [regCom, setRegCom] = useState(current.registrationNumber ?? '')
  const [email, setEmail] = useState(current.email ?? '')
  const [phone, setPhone] = useState(current.phone ?? '')
  const [addressLine1, setAddressLine1] = useState(current.addressLine1 ?? '')
  const [addressLine2, setAddressLine2] = useState(current.addressLine2 ?? '')
  const [city, setCity] = useState(current.city ?? '')
  const [county, setCounty] = useState(current.county ?? '')
  const [postalCode, setPostalCode] = useState(current.postalCode ?? '')

  // ANAF autofill: entering a CUI pre-fills legal name, address, reg. com.
  // and postal code. Mirrors the practice_admin settings form.
  const handleAnafSuccess = useCallback(
    (data: {
      denumire: string
      adresa: string
      nrRegCom: string
      codPostal: string
    }) => {
      if (data.denumire) setLegalName(data.denumire)
      if (data.adresa) setAddressLine1(data.adresa)
      if (data.nrRegCom) setRegCom(data.nrRegCom)
      if (data.codPostal) setPostalCode(data.codPostal)
      toastSuccess('Date ANAF preluate', data.denumire)
    },
    []
  )
  const anaf = useAnafLookup(handleAnafSuccess)

  async function handleSave() {
    setBusy(true)
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          legalName,
          cui,
          regCom,
          email,
          phone,
          addressLine1,
          addressLine2,
          city,
          county,
          postalCode,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toastError(data.error ?? labels.error)
        return
      }
      toastSuccess(labels.success)
      router.refresh()
    } catch {
      toastError(labels.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-card border rounded-lg p-6 space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{labels.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{labels.help}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="td-name">{labels.name}</Label>
          <Input id="td-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="td-legalName">{labels.legalName}</Label>
          <Input id="td-legalName" value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={200} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="td-cui">{labels.cui}</Label>
          <div className="flex gap-2">
            <Input
              id="td-cui"
              value={cui}
              onChange={(e) => {
                setCui(e.target.value)
                anaf.lookup(e.target.value)
              }}
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
          {anaf.status === 'found' && <p className="text-xs text-green-600">{labels.anafFound}</p>}
          {anaf.status === 'inactive' && <p className="text-xs text-amber-600">{labels.anafInactive}</p>}
          {anaf.status === 'error' && <p className="text-xs text-destructive">{anaf.error}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="td-regCom">{labels.regCom}</Label>
          <Input id="td-regCom" value={regCom} onChange={(e) => setRegCom(e.target.value)} maxLength={50} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="td-email">{labels.email}</Label>
          <Input id="td-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="td-phone">{labels.phone}</Label>
          <Input id="td-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={50} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="td-addressLine1">{labels.addressLine1}</Label>
        <Input id="td-addressLine1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} maxLength={300} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="td-addressLine2">{labels.addressLine2}</Label>
        <Input id="td-addressLine2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} maxLength={300} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="td-city">{labels.city}</Label>
          <Input id="td-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="td-county">{labels.county}</Label>
          <Input id="td-county" value={county} onChange={(e) => setCounty(e.target.value)} maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="td-postalCode">{labels.postalCode}</Label>
          <Input id="td-postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={20} />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button onClick={handleSave} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {labels.saving}
            </>
          ) : (
            labels.save
          )}
        </Button>
      </div>
    </section>
  )
}
