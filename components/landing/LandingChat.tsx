'use client'

import { useEffect, useRef, useState } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const GREETING: Message = {
  role: 'assistant',
  content:
    'Bună! Sunt asistentul Buzomed. Cum te pot ajuta? Poți întreba despre funcționalități, securitate, prețuri sau orice altceva despre platformă.',
}

const SUGGESTED = [
  'Cât timp economisesc?',
  'Cum sunt protejate datele?',
  'Care este prețul?',
]

// ─── Inline SVGs ────────────────────────────────────────────────────────────

function IconChat() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function IconBot() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <line x1="12" y1="3" x2="12" y2="7" />
      <circle cx="12" cy="3" r="1" />
      <line x1="8" y1="15" x2="8" y2="17" />
      <line x1="16" y1="15" x2="16" y2="17" />
    </svg>
  )
}

function IconLoader() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LandingChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasNew, setHasNew] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  // Show notification dot after 8s if never opened
  useEffect(() => {
    const t = setTimeout(() => {
      if (!isOpen) setHasNew(true)
    }, 8000)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openChat() {
    setIsOpen(true)
    setHasNew(false)
  }

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', content: trimmed }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    try {
      const res = await fetch('/api/landing-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-10) }),
      })
      const data = await res.json()
      const reply = data.reply ?? data.error ?? 'A apărut o eroare. Încearcă din nou.'
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch {
      setMessages([...next, { role: 'assistant', content: 'Conexiune eșuată. Verifică internetul și încearcă din nou.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <>
      <style>{`
        @media (max-width: 480px) {
          .lc-window {
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            max-height: 85vh !important;
            border-radius: 16px 16px 0 0 !important;
          }
          .lc-trigger {
            bottom: 16px !important;
            right: 16px !important;
          }
        }
        @keyframes lc-fadein {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        .lc-window { animation: lc-fadein 0.2s ease; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%           { transform: translateY(-6px); }
        }
        .lc-dot { animation: bounce 1.2s infinite; }
        .lc-dot:nth-child(2) { animation-delay: 0.2s; }
        .lc-dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>

      {/* Trigger button */}
      <div
        className="lc-trigger"
        style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999 }}
      >
        <button
          onClick={openChat}
          aria-label="Deschide chat"
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1E4D8B 0%, #2BA39A 100%)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: '0 4px 20px rgba(30,77,139,0.35)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.transform = 'scale(1.08)'
            el.style.boxShadow = '0 6px 24px rgba(30,77,139,0.45)'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.transform = 'scale(1)'
            el.style.boxShadow = '0 4px 20px rgba(30,77,139,0.35)'
          }}
        >
          <IconChat />
          {hasNew && !isOpen && (
            <span style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#ef4444',
              border: '2px solid white',
            }} />
          )}
        </button>
      </div>

      {/* Chat window */}
      {isOpen && (
        <div
          className="lc-window"
          style={{
            position: 'fixed',
            bottom: 96,
            right: 24,
            width: 360,
            maxHeight: 520,
            borderRadius: 16,
            background: 'white',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9998,
            border: '1px solid #E2E8F0',
          }}
        >
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #1E4D8B 0%, #2BA39A 100%)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
            }}>
              <IconBot />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'white', fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>Asistent Buzomed</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>Răspunde în câteva secunde</div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.8)',
                padding: 4,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Închide chat"
            >
              <IconClose />
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '84%',
                  padding: '9px 13px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #1E4D8B, #2563EB)'
                    : '#F1F5F9',
                  color: msg.role === 'user' ? 'white' : '#1E293B',
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Suggested questions — only after greeting */}
            {messages.length === 1 && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {SUGGESTED.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    style={{
                      background: 'none',
                      border: '1px solid #CBD5E1',
                      borderRadius: 20,
                      padding: '6px 14px',
                      fontSize: 13,
                      color: '#1E4D8B',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.1s, border-color 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget
                      el.style.background = '#EFF6FF'
                      el.style.borderColor = '#93C5FD'
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget
                      el.style.background = 'none'
                      el.style.borderColor = '#CBD5E1'
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Loading dots */}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  background: '#F1F5F9',
                  borderRadius: '16px 16px 16px 4px',
                  padding: '12px 16px',
                  display: 'flex',
                  gap: 4,
                  alignItems: 'center',
                }}>
                  {[0, 1, 2].map((n) => (
                    <span key={n} className="lc-dot" style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#94A3B8',
                      display: 'inline-block',
                    }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div style={{
            borderTop: '1px solid #E2E8F0',
            padding: '10px 12px',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            flexShrink: 0,
            background: 'white',
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown}
              placeholder="Scrie un mesaj..."
              rows={1}
              disabled={loading}
              style={{
                flex: 1,
                resize: 'none',
                border: '1px solid #CBD5E1',
                borderRadius: 10,
                padding: '8px 12px',
                fontSize: 14,
                lineHeight: 1.5,
                outline: 'none',
                fontFamily: 'inherit',
                background: loading ? '#F8FAFC' : 'white',
                color: '#1E293B',
                minHeight: 38,
                maxHeight: 120,
                overflowY: 'auto',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#1E4D8B')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#CBD5E1')}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: loading || !input.trim()
                  ? '#E2E8F0'
                  : 'linear-gradient(135deg, #1E4D8B, #2BA39A)',
                border: 'none',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: loading || !input.trim() ? '#94A3B8' : 'white',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
              aria-label="Trimite"
            >
              {loading ? <IconLoader /> : <IconSend />}
            </button>
          </div>

          {/* Footer */}
          <div style={{
            textAlign: 'center',
            fontSize: 11,
            color: '#94A3B8',
            padding: '4px 0 8px',
            flexShrink: 0,
          }}>
            Powered by Claude AI
          </div>
        </div>
      )}
    </>
  )
}
