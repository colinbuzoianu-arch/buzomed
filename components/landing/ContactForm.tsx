'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

const SUBJECTS = [
  'Întrebare despre funcționalități',
  'Problemă tehnică',
  'Întrebare despre confidențialitate',
  'Parteneriat sau colaborare',
  'Altceva',
]

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  color: '#0F1F3A',
  background: 'white',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'Inter, sans-serif',
  transition: 'border-color 0.15s',
}

function Field({
  label, id, required = true, children,
}: {
  label: string; id: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#0F1F3A' }}>
        {label}{required && <span style={{ color: '#2BA39A', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')  // honeypot — must stay empty
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)

  function borderColor(field: string) {
    return focused === field ? '#2BA39A' : '#E2E8F0'
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), subject, message: message.trim(), website }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'A apărut o eroare. Încearcă din nou.')
        return
      }
      setSuccess(true)
    } catch {
      setError('Conexiune eșuată. Verifică internetul și încearcă din nou.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <CheckCircle2 size={28} color="#2BA39A" style={{ margin: '0 auto' }} />
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0F1F3A', marginTop: 12, marginBottom: 8 }}>
          Mesaj trimis!
        </h3>
        <p style={{ fontSize: 14, color: '#6B7A8D', lineHeight: 1.7 }}>
          Mulțumim! Vă răspundem la <strong>{email.trim()}</strong> în 24–48 de ore lucrătoare.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0F1F3A', marginBottom: 4 }}>
        Trimiteți un mesaj
      </h2>
      <p style={{ fontSize: 14, color: '#6B7A8D', marginBottom: 24, lineHeight: 1.6 }}>
        Completați formularul și vă răspundem în cel mai scurt timp.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Nume" id="cf-name">
            <input
              id="cf-name"
              type="text"
              placeholder="Ion Popescu"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => setFocused('name')}
              onBlur={() => setFocused(null)}
              disabled={loading}
              style={{ ...INPUT_STYLE, borderColor: borderColor('name') }}
            />
          </Field>
          <Field label="Email" id="cf-email">
            <input
              id="cf-email"
              type="email"
              placeholder="ion@cabinet.ro"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              disabled={loading}
              style={{ ...INPUT_STYLE, borderColor: borderColor('email') }}
            />
          </Field>
        </div>

        <Field label="Subiect" id="cf-subject">
          <select
            id="cf-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onFocus={() => setFocused('subject')}
            onBlur={() => setFocused(null)}
            disabled={loading}
            style={{ ...INPUT_STYLE, borderColor: borderColor('subject'), cursor: 'pointer' }}
          >
            <option value="" disabled>Selectați un subiect</option>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        {/* Honeypot — invisible to humans, filled by bots */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-9999px',
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />

        <Field label="Mesaj" id="cf-message">
          <textarea
            id="cf-message"
            rows={5}
            placeholder="Descrieți pe scurt cum vă putem ajuta..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onFocus={() => setFocused('message')}
            onBlur={() => setFocused(null)}
            disabled={loading}
            style={{ ...INPUT_STYLE, borderColor: borderColor('message'), resize: 'none', lineHeight: 1.6 }}
          />
        </Field>

        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FCA5A5',
            borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#DC2626',
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !name.trim() || !email.trim() || !subject || !message.trim()}
          style={{
            marginTop: 4,
            width: '100%',
            background: loading || !name.trim() || !email.trim() || !subject || !message.trim()
              ? '#93C5E8' : '#1E4D8B',
            color: 'white',
            fontWeight: 600,
            fontSize: 15,
            padding: '12px',
            borderRadius: 12,
            border: 'none',
            cursor: loading || !name.trim() || !email.trim() || !subject || !message.trim()
              ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontFamily: 'Inter, sans-serif',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!e.currentTarget.disabled) e.currentTarget.style.background = '#163d70'
          }}
          onMouseLeave={(e) => {
            if (!e.currentTarget.disabled) e.currentTarget.style.background = '#1E4D8B'
          }}
        >
          {loading && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
          {loading ? 'Se trimite...' : 'Trimite mesajul'}
        </button>
      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
