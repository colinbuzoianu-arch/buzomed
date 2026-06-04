'use client'

import { useState } from 'react'
import { API_SCOPES, type ApiScope } from '@/lib/api-keys/scopes'

type ApiKey = {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

type WebhookEndpoint = {
  id: string
  url: string
  description: string | null
  events: string[]
  secretPrefix: string
  isActive: boolean
  lastTriggeredAt: string | null
  failureCount: number
  createdAt: string
}

type Delivery = {
  id: string
  event: string
  responseStatus: number | null
  responseBody: string | null
  durationMs: number | null
  success: boolean
  attemptedAt: string
}

const ALL_EVENTS = [
  { value: 'examination.signed', label: 'Fișă semnată' },
  { value: 'examination.scheduled', label: 'Examinare programată' },
  { value: 'examination.completed', label: 'Examinare finalizată' },
  { value: 'recall.due_soon', label: 'Scadență apropiată' },
  { value: 'employee.created', label: 'Angajat creat' },
  { value: 'employee.updated', label: 'Angajat modificat' },
]

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface Props {
  keys: ApiKey[]
  endpoints: WebhookEndpoint[]
}

export function ApiSettingsClient({ keys: initialKeys, endpoints: initialEndpoints }: Props) {
  const [activeTab, setActiveTab] = useState<'keys' | 'webhooks'>('keys')
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys)
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>(initialEndpoints)

  // Create key dialog
  const [showCreateKey, setShowCreateKey] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScopes, setNewKeyScopes] = useState<ApiScope[]>([])
  const [newKeyExpires, setNewKeyExpires] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)

  // Create webhook dialog
  const [showCreateWebhook, setShowCreateWebhook] = useState(false)
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookDesc, setNewWebhookDesc] = useState('')
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([])
  const [creatingWebhook, setCreatingWebhook] = useState(false)
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null)
  const [webhookError, setWebhookError] = useState<string | null>(null)

  // Deliveries expanded
  const [expandedEndpointId, setExpandedEndpointId] = useState<string | null>(null)
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({})
  const [loadingDeliveries, setLoadingDeliveries] = useState<string | null>(null)

  // Revoke key
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)

  async function handleCreateKey() {
    setKeyError(null)
    if (!newKeyName.trim()) { setKeyError('Introdu un nume'); return }
    if (newKeyScopes.length === 0) { setKeyError('Selectează cel puțin un scop'); return }
    setCreatingKey(true)
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes: newKeyScopes,
          expiresAt: newKeyExpires || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setKeyError(data.issues?.join(', ') ?? data.error ?? 'Eroare')
        return
      }
      setNewKeyRaw(data.raw)
      setKeys((prev) => [{ ...data.key, lastUsedAt: null, expiresAt: data.key.expiresAt ?? null, revokedAt: null }, ...prev])
      setNewKeyName('')
      setNewKeyScopes([])
      setNewKeyExpires('')
      setShowCreateKey(false)
    } catch {
      setKeyError('Eroare de rețea')
    } finally {
      setCreatingKey(false)
    }
  }

  async function handleRevokeKey(id: string) {
    if (!confirm('Sigur vrei să revoci această cheie API? Integrările care o folosesc vor înceta să funcționeze.')) return
    setRevokingKeyId(id)
    try {
      const res = await fetch(`/api/settings/api-keys/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setKeys((prev) => prev.map((k) => k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k))
      }
    } finally {
      setRevokingKeyId(null)
    }
  }

  async function handleCreateWebhook() {
    setWebhookError(null)
    if (!newWebhookUrl.startsWith('https://')) { setWebhookError('URL-ul trebuie să înceapă cu https://'); return }
    if (newWebhookEvents.length === 0) { setWebhookError('Selectează cel puțin un eveniment'); return }
    setCreatingWebhook(true)
    try {
      const res = await fetch('/api/settings/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newWebhookUrl.trim(),
          description: newWebhookDesc.trim() || undefined,
          events: newWebhookEvents,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setWebhookError(data.issues?.join(', ') ?? data.error ?? 'Eroare')
        return
      }
      setNewWebhookSecret(data.rawSecret)
      setEndpoints((prev) => [{ ...data.endpoint, failureCount: 0, lastTriggeredAt: null }, ...prev])
      setNewWebhookUrl('')
      setNewWebhookDesc('')
      setNewWebhookEvents([])
      setShowCreateWebhook(false)
    } catch {
      setWebhookError('Eroare de rețea')
    } finally {
      setCreatingWebhook(false)
    }
  }

  async function handleToggleDeliveries(id: string) {
    if (expandedEndpointId === id) {
      setExpandedEndpointId(null)
      return
    }
    setExpandedEndpointId(id)
    if (deliveries[id]) return
    setLoadingDeliveries(id)
    try {
      const res = await fetch(`/api/settings/webhooks/${id}/deliveries`)
      const data = await res.json()
      if (res.ok) {
        setDeliveries((prev) => ({ ...prev, [id]: data.deliveries }))
      }
    } finally {
      setLoadingDeliveries(null)
    }
  }

  async function handleDisableWebhook(id: string) {
    const res = await fetch(`/api/settings/webhooks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    if (res.ok) {
      setEndpoints((prev) => prev.map((e) => e.id === id ? { ...e, isActive: false } : e))
    }
  }

  const tabClass = (t: 'keys' | 'webhooks') =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      activeTab === t
        ? 'border-primary text-primary'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`

  return (
    <div className="space-y-4">
      {/* One-time key display */}
      {newKeyRaw && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900">
            Aceasta este singura dată când cheia API este afișată. Copiaz-o acum!
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-white border border-amber-200 px-3 py-2 text-sm font-mono break-all">
              {newKeyRaw}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(newKeyRaw); }}
              className="shrink-0 rounded border border-amber-300 bg-white px-3 py-2 text-xs hover:bg-amber-50"
            >
              Copiază
            </button>
          </div>
          <button onClick={() => setNewKeyRaw(null)} className="text-xs text-amber-700 hover:underline">
            Am copiat cheia, închide
          </button>
        </div>
      )}

      {/* One-time webhook secret display */}
      {newWebhookSecret && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900">
            Secretul webhook este afișat o singură dată. Salvează-l pentru verificarea semnăturii!
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-white border border-amber-200 px-3 py-2 text-sm font-mono break-all">
              {newWebhookSecret}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(newWebhookSecret); }}
              className="shrink-0 rounded border border-amber-300 bg-white px-3 py-2 text-xs hover:bg-amber-50"
            >
              Copiază
            </button>
          </div>
          <button onClick={() => setNewWebhookSecret(null)} className="text-xs text-amber-700 hover:underline">
            Am copiat secretul, închide
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b flex gap-0">
        <button className={tabClass('keys')} onClick={() => setActiveTab('keys')}>
          Chei API
        </button>
        <button className={tabClass('webhooks')} onClick={() => setActiveTab('webhooks')}>
          Webhook-uri
        </button>
      </div>

      {/* API Keys tab */}
      {activeTab === 'keys' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { setShowCreateKey(true); setKeyError(null); }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Cheie nouă
            </button>
          </div>

          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nicio cheie API. Creează una pentru a permite integrări externe.
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Nume</th>
                    <th className="text-left px-4 py-3 font-medium">Prefix</th>
                    <th className="text-left px-4 py-3 font-medium">Scopuri</th>
                    <th className="text-left px-4 py-3 font-medium">Ultima utilizare</th>
                    <th className="text-left px-4 py-3 font-medium">Expiră</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {keys.map((k) => (
                    <tr key={k.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{k.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.keyPrefix}…</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <span key={s} className="inline-block rounded bg-muted px-2 py-0.5 text-xs">
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(k.lastUsedAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(k.expiresAt)}</td>
                      <td className="px-4 py-3">
                        {k.revokedAt ? (
                          <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                            Revocată
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                            Activă
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!k.revokedAt && (
                          <button
                            onClick={() => handleRevokeKey(k.id)}
                            disabled={revokingKeyId === k.id}
                            className="text-xs text-destructive hover:underline disabled:opacity-50"
                          >
                            Revocare
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Webhooks tab */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { setShowCreateWebhook(true); setWebhookError(null); }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Webhook
            </button>
          </div>

          {endpoints.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Niciun webhook. Creează unul pentru a primi notificări în timp real.
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">URL</th>
                    <th className="text-left px-4 py-3 font-medium">Evenimente</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Erori</th>
                    <th className="text-left px-4 py-3 font-medium">Ultima livrare</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {endpoints.map((ep) => (
                    <>
                      <tr
                        key={ep.id}
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => handleToggleDeliveries(ep.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="max-w-xs truncate font-mono text-xs" title={ep.url}>{ep.url}</div>
                          {ep.description && (
                            <div className="text-muted-foreground text-xs mt-0.5">{ep.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {ep.events.map((e) => (
                              <span key={e} className="inline-block rounded bg-muted px-2 py-0.5 text-xs">
                                {ALL_EVENTS.find((x) => x.value === e)?.label ?? e}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {ep.isActive ? (
                            <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Activ</span>
                          ) : (
                            <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Inactiv</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{ep.failureCount}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(ep.lastTriggeredAt)}</td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {ep.isActive && (
                            <button
                              onClick={() => handleDisableWebhook(ep.id)}
                              className="text-xs text-destructive hover:underline"
                            >
                              Dezactivare
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedEndpointId === ep.id && (
                        <tr key={`${ep.id}-deliveries`}>
                          <td colSpan={6} className="px-4 py-3 bg-muted/20">
                            {loadingDeliveries === ep.id ? (
                              <p className="text-xs text-muted-foreground">Se încarcă...</p>
                            ) : (deliveries[ep.id]?.length ?? 0) === 0 ? (
                              <p className="text-xs text-muted-foreground">Nicio livrare înregistrată.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground">
                                    <th className="text-left py-1 pr-3 font-medium">Data</th>
                                    <th className="text-left py-1 pr-3 font-medium">Eveniment</th>
                                    <th className="text-left py-1 pr-3 font-medium">HTTP</th>
                                    <th className="text-left py-1 pr-3 font-medium">Durată</th>
                                    <th className="text-left py-1 font-medium">Succes</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                  {deliveries[ep.id].map((d) => (
                                    <tr key={d.id}>
                                      <td className="py-1 pr-3">{formatDateTime(d.attemptedAt)}</td>
                                      <td className="py-1 pr-3 font-mono">{d.event}</td>
                                      <td className="py-1 pr-3">{d.responseStatus ?? '—'}</td>
                                      <td className="py-1 pr-3">{d.durationMs != null ? `${d.durationMs}ms` : '—'}</td>
                                      <td className="py-1">
                                        <span className={`rounded-full px-2 py-0.5 ${d.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {d.success ? 'Da' : 'Nu'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create API Key modal */}
      {showCreateKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <h2 className="text-lg font-semibold">Cheie API nouă</h2>

            <div className="space-y-1">
              <label className="text-sm font-medium">Nume</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Ex: SAP HR Integration"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Scopuri</label>
              {(Object.entries(API_SCOPES) as [ApiScope, string][]).map(([scope, label]) => (
                <label key={scope} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newKeyScopes.includes(scope)}
                    onChange={(e) =>
                      setNewKeyScopes((prev) =>
                        e.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope)
                      )
                    }
                  />
                  <span className="text-sm">
                    <span className="font-mono text-xs mr-1 text-muted-foreground">{scope}</span>
                    {label}
                  </span>
                </label>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Expiră la (opțional)</label>
              <input
                type="date"
                value={newKeyExpires}
                onChange={(e) => setNewKeyExpires(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {keyError && <p className="text-sm text-destructive">{keyError}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowCreateKey(false); setKeyError(null); }}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                Anulare
              </button>
              <button
                onClick={handleCreateKey}
                disabled={creatingKey}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creatingKey ? 'Se creează...' : 'Creare'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Webhook modal */}
      {showCreateWebhook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <h2 className="text-lg font-semibold">Webhook nou</h2>

            <div className="space-y-1">
              <label className="text-sm font-medium">URL (https://)</label>
              <input
                type="url"
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                placeholder="https://example.com/webhooks/buzomed"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Descriere (opțional)</label>
              <input
                type="text"
                value={newWebhookDesc}
                onChange={(e) => setNewWebhookDesc(e.target.value)}
                placeholder="Ex: SAP HR notificări"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Evenimente</label>
              {ALL_EVENTS.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newWebhookEvents.includes(value)}
                    onChange={(e) =>
                      setNewWebhookEvents((prev) =>
                        e.target.checked ? [...prev, value] : prev.filter((x) => x !== value)
                      )
                    }
                  />
                  <span className="text-sm">
                    <span className="font-mono text-xs mr-1 text-muted-foreground">{value}</span>
                    {label}
                  </span>
                </label>
              ))}
            </div>

            {webhookError && <p className="text-sm text-destructive">{webhookError}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowCreateWebhook(false); setWebhookError(null); }}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                Anulare
              </button>
              <button
                onClick={handleCreateWebhook}
                disabled={creatingWebhook}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creatingWebhook ? 'Se creează...' : 'Creare'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
