'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Labels = Record<string, string>

export function CreateTenantForm({ labels }: { labels: Labels }) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    slug: '',
    legalName: '',
    cui: '',
    registrationNumber: '',
    addressLine1: '',
    city: '',
    county: '',
    postalCode: '',
    phone: '',
    email: '',
    adminEmail: '',
    adminFirstName: '',
    adminLastName: '',
    subscriptionTier: 'trial' as 'trial' | 'solo' | 'practice' | 'enterprise',
  })

  const [termsAccepted, setTermsAccepted] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [dpaAccepted, setDpaAccepted] = useState(false)
  const [dpaName, setDpaName] = useState('')

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm({ ...form, [key]: value })
  }

  // Auto-generate slug from name
  function handleNameChange(name: string) {
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    setForm({ ...form, name, slug: form.slug === '' ? slug : form.slug })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!termsAccepted || !privacyAccepted || !dpaAccepted) {
      setError('Trebuie să acceptați toți termenii înainte de a crea un cabinet.')
      return
    }
    if (!dpaName.trim()) {
      setError('Introduceți numele persoanei responsabile pentru DPA.')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          termsAccepted,
          privacyAccepted,
          dpaAccepted,
          dpaName: dpaName.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.error || labels.errorMessage)
        setIsSubmitting(false)
        return
      }

      router.push('/super-admin')
      router.refresh()
    } catch (err) {
      console.error(err)
      setError(labels.errorMessage)
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Tenant info section */}
      <section className="bg-card border rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">{labels.tenantInfo}</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">{labels.nameLabel} *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={labels.namePlaceholder}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">{labels.slugLabel} *</Label>
            <Input
              id="slug"
              value={form.slug}
              onChange={(e) => update('slug', e.target.value)}
              placeholder={labels.slugPlaceholder}
              pattern="[a-z0-9-]+"
              required
            />
            <p className="text-xs text-muted-foreground">{labels.slugHelp}</p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="legalName">{labels.legalNameLabel}</Label>
            <Input
              id="legalName"
              value={form.legalName}
              onChange={(e) => update('legalName', e.target.value)}
              placeholder={labels.legalNamePlaceholder}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cui">{labels.cuiLabel}</Label>
            <Input
              id="cui"
              value={form.cui}
              onChange={(e) => update('cui', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="registrationNumber">{labels.registrationLabel}</Label>
            <Input
              id="registrationNumber"
              value={form.registrationNumber}
              onChange={(e) => update('registrationNumber', e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Address section */}
      <section className="bg-card border rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">{labels.addressInfo}</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="addressLine1">{labels.addressInfo}</Label>
            <Input
              id="addressLine1"
              value={form.addressLine1}
              onChange={(e) => update('addressLine1', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">{labels.cityLabel}</Label>
            <Input
              id="city"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="county">{labels.countyLabel}</Label>
            <Input
              id="county"
              value={form.county}
              onChange={(e) => update('county', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="postalCode">{labels.postalCodeLabel}</Label>
            <Input
              id="postalCode"
              value={form.postalCode}
              onChange={(e) => update('postalCode', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{labels.phoneLabel}</Label>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="email">{labels.emailLabel}</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Admin section */}
      <section className="bg-card border rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">{labels.adminInfo}</h2>
        <p className="text-sm text-muted-foreground">{labels.adminEmailHelp}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="adminEmail">{labels.adminEmailLabel} *</Label>
            <Input
              id="adminEmail"
              type="email"
              value={form.adminEmail}
              onChange={(e) => update('adminEmail', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminFirstName">{labels.adminFirstNameLabel} *</Label>
            <Input
              id="adminFirstName"
              value={form.adminFirstName}
              onChange={(e) => update('adminFirstName', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminLastName">{labels.adminLastNameLabel} *</Label>
            <Input
              id="adminLastName"
              value={form.adminLastName}
              onChange={(e) => update('adminLastName', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="subscriptionTier">{labels.subscriptionLabel}</Label>
            <select
              id="subscriptionTier"
              value={form.subscriptionTier}
              onChange={(e) => update('subscriptionTier', e.target.value as typeof form.subscriptionTier)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="trial">{labels.subscriptionTrial}</option>
              <option value="solo">{labels.subscriptionSolo}</option>
              <option value="practice">{labels.subscriptionPractice}</option>
              <option value="enterprise">{labels.subscriptionEnterprise}</option>
            </select>
          </div>
        </div>
      </section>

      {/* GDPR consent — obligatoriu înainte de creare */}
      <section className="bg-card border rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Confirmări obligatorii
        </h2>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={e => setTermsAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span className="text-sm text-foreground">
            Am citit și accept{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
              Termenii și Condițiile
            </a>{' '}
            Buzomed.
          </span>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={e => setPrivacyAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span className="text-sm text-foreground">
            Am citit și accept{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
              Politica de Confidențialitate
            </a>{' '}
            și prelucrarea datelor cu caracter personal conform GDPR.
          </span>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={dpaAccepted}
            onChange={e => setDpaAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span className="text-sm text-foreground">
            Accept Acordul de Prelucrare a Datelor (DPA) între cabinet și Verumsell SRL,
            în calitate de procesator de date conform Art. 28 GDPR.
          </span>
        </label>

        {dpaAccepted && (
          <div className="space-y-1.5 ml-6">
            <label className="text-xs text-muted-foreground">
              Numele persoanei responsabile (reprezentant legal sau DPO) *
            </label>
            <input
              type="text"
              value={dpaName}
              onChange={e => setDpaName(e.target.value)}
              placeholder="ex. Dr. Ion Popescu"
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        )}
      </section>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          {error}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {labels.cancel}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? labels.submitting : labels.submitButton}
        </Button>
      </div>
    </form>
  )
}
