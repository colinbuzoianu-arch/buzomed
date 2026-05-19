'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ClipboardList, CheckCircle2, Info, Loader2 } from 'lucide-react'

// ─── Nav ─────────────────────────────────────────────────────────────────────

function RegisterNav() {
  return (
    <nav style={{ background: 'white', borderBottom: '1px solid #E2E8F0', padding: '0 24px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Image src="/buzomed-icon.png" width={28} height={28} alt="Buzomed" />
          <span style={{ fontWeight: 600, fontSize: 18, color: '#0F1F3A', letterSpacing: '-0.01em' }}>
            buzomed
          </span>
        </Link>
      </div>
    </nav>
  )
}

// ─── Input field ─────────────────────────────────────────────────────────────

function Field({
  label,
  optional,
  id,
  type = 'text',
  placeholder,
  value,
  onChange,
  disabled,
}: {
  label: string
  optional?: boolean
  id: string
  type?: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label
        htmlFor={id}
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#0F1F3A' }}
      >
        {label}
        {!optional && <span style={{ color: '#2BA39A' }}>*</span>}
        {optional && <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(opțional)</span>}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        style={{
          width: '100%',
          border: `1px solid ${focused ? '#2BA39A' : '#E2E8F0'}`,
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: 14,
          color: '#0F1F3A',
          background: disabled ? '#F8FAFC' : 'white',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cabinetName, setCabinetName] = useState('')
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/register-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), cabinetName: cabinetName.trim(), city: city.trim() || undefined }),
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

  return (
    <div style={{ minHeight: '100vh', background: 'white', fontFamily: 'Inter, sans-serif' }}>
      <RegisterNav />

      <div style={{ maxWidth: 480, margin: '64px auto 64px', padding: '0 16px' }}>
        <div style={{
          background: 'white',
          borderRadius: 16,
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          padding: 32,
        }}>
          {success ? (
            /* ── Success state ── */
            <div>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: '#E6F5F4',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto',
              }}>
                <CheckCircle2 size={28} color="#2BA39A" />
              </div>

              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0F1F3A', textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
                Contul a fost creat!
              </h2>

              <p style={{ fontSize: 15, color: '#6B7A8D', textAlign: 'center', marginTop: 12, lineHeight: 1.7, maxWidth: 360, margin: '12px auto 0' }}>
                Am trimis un link de activare la adresa:
              </p>

              <p style={{ textAlign: 'center', marginTop: 8, color: '#0F1F3A', fontWeight: 500, fontSize: 15 }}>
                {email.trim()}
              </p>

              <p style={{ fontSize: 15, color: '#6B7A8D', textAlign: 'center', marginTop: 12, lineHeight: 1.7, maxWidth: 360, margin: '12px auto 0' }}>
                Verificați inbox-ul și urmați instrucțiunile din email pentru a vă activa contul.
              </p>

              <div style={{
                marginTop: 20,
                background: '#F0FBF9',
                border: '1px solid #B2E0DB',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <Info size={16} color="#2BA39A" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: 13, color: '#2BA39A', lineHeight: 1.5 }}>
                  Dacă nu primiți emailul în câteva minute, verificați folderul Spam sau scrieți-ne la{' '}
                  <a href="mailto:hello@buzomed.com" style={{ color: '#2BA39A', fontWeight: 500 }}>hello@buzomed.com</a>
                </p>
              </div>

              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <Link href="/" style={{ color: '#2BA39A', textDecoration: 'none', fontSize: 14 }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                  ← Înapoi la buzomed.com
                </Link>
              </div>
            </div>
          ) : (
            /* ── Form state ── */
            <div>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: '#EBF3FB',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto',
              }}>
                <ClipboardList size={24} color="#1E4D8B" />
              </div>

              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0F1F3A', textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
                Creează cont Buzomed
              </h1>

              <p style={{ fontSize: 15, color: '#6B7A8D', textAlign: 'center', marginTop: 8, lineHeight: 1.6, maxWidth: 380, margin: '8px auto 0' }}>
                Completați formularul de mai jos și veți primi imediat un link de activare pe email.
              </p>

              <form onSubmit={handleSubmit} style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field
                  id="reg-name"
                  label="Nume și prenume"
                  placeholder="Dr. Ion Popescu"
                  value={name}
                  onChange={setName}
                  disabled={loading}
                />
                <Field
                  id="reg-email"
                  label="Adresă de email"
                  type="email"
                  placeholder="dr.popescu@cabinet.ro"
                  value={email}
                  onChange={setEmail}
                  disabled={loading}
                />
                <Field
                  id="reg-cabinet"
                  label="Numele cabinetului / clinicii"
                  placeholder="Cabinet Dr. Popescu"
                  value={cabinetName}
                  onChange={setCabinetName}
                  disabled={loading}
                />
                <Field
                  id="reg-city"
                  label="Oraș"
                  optional
                  placeholder="Timișoara"
                  value={city}
                  onChange={setCity}
                  disabled={loading}
                />

                {error && (
                  <div style={{
                    background: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 14,
                    color: '#DC2626',
                  }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !name.trim() || !email.trim() || !cabinetName.trim()}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    background: loading || !name.trim() || !email.trim() || !cabinetName.trim()
                      ? '#93C5E8' : '#1E4D8B',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: 15,
                    padding: '12px',
                    borderRadius: 12,
                    border: 'none',
                    cursor: loading || !name.trim() || !email.trim() || !cabinetName.trim()
                      ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget
                    if (!el.disabled) el.style.background = '#163d70'
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget
                    if (!el.disabled) el.style.background = '#1E4D8B'
                  }}
                >
                  {loading && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                  {loading ? 'Se creează contul...' : 'Creează cont'}
                </button>
              </form>

              <p style={{ textAlign: 'center', fontSize: 13, color: '#9CA3AF', marginTop: 16, lineHeight: 1.6 }}>
                Prin crearea contului, acceptați Politica de confidențialitate Buzomed.
                <br />Datele sunt găzduite în Frankfurt, UE.
              </p>

              <p style={{ textAlign: 'center', fontSize: 13, marginTop: 16, color: '#6B7A8D' }}>
                Aveți deja un cont?{' '}
                <Link href="/login" style={{ color: '#2BA39A', textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                  Autentificați-vă
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
