'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toastError, toastSuccess } from '@/lib/toast'

interface AddressLabels {
  title: string
  help: string
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  postalCode: string
  save: string
  saving: string
  success: string
  error: string
}

interface Props {
  tenantId: string
  labels: AddressLabels
  current: {
    addressLine1: string | null
    addressLine2: string | null
    city: string | null
    county: string | null
    postalCode: string | null
  }
}

export function TenantAddressForm({ tenantId, labels, current }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [addressLine1, setAddressLine1] = useState(current.addressLine1 ?? '')
  const [addressLine2, setAddressLine2] = useState(current.addressLine2 ?? '')
  const [city, setCity] = useState(current.city ?? '')
  const [county, setCounty] = useState(current.county ?? '')
  const [postalCode, setPostalCode] = useState(current.postalCode ?? '')

  async function handleSave() {
    setBusy(true)
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}/address`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addressLine1, addressLine2, city, county, postalCode }),
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
    <section className="bg-card border rounded-lg p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{labels.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{labels.help}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ta-addressLine1">{labels.addressLine1}</Label>
        <Input
          id="ta-addressLine1"
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
          maxLength={300}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ta-addressLine2">{labels.addressLine2}</Label>
        <Input
          id="ta-addressLine2"
          value={addressLine2}
          onChange={(e) => setAddressLine2(e.target.value)}
          maxLength={300}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ta-city">{labels.city}</Label>
          <Input
            id="ta-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={100}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ta-county">{labels.county}</Label>
          <Input
            id="ta-county"
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            maxLength={100}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ta-postalCode">{labels.postalCode}</Label>
          <Input
            id="ta-postalCode"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            maxLength={20}
          />
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
