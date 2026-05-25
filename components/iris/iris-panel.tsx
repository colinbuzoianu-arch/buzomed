'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { IrisAvatar } from './iris-avatar'
import { Button } from '@/components/ui/button'

type Message = {
  role: 'user' | 'assistant'
  content: string
  id: string
}

type IrisPanelProps = {
  cabinetName: string
  locale: 'ro' | 'en'
  userName: string
}

// ─── Suggested starter questions ──────────────────────────────────────────────

const STARTERS: Record<'ro' | 'en', string[]> = {
  ro: [
    'Cum adaug o companie nouă?',
    'Cum generez o fișă de aptitudine?',
    'Cum import angajați din Excel?',
    'Ce înseamnă o scadență overdue?',
  ],
  en: [
    'How do I add a new company?',
    'How do I generate a fitness certificate?',
    'How do I import employees from Excel?',
    'What does an overdue recall mean?',
  ],
}

// ─── Escalation detection ─────────────────────────────────────────────────────

function looksLikeEscalationPrompt(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('escaladez') ||
    lower.includes('escalare') ||
    lower.includes('confirmă') ||
    lower.includes('confirma') ||
    (lower.includes('trimite') && lower.includes('colin')) ||
    lower.includes('escalate') ||
    lower.includes('confirm')
  )
}

function looksLikeConfirmation(text: string): boolean {
  const lower = text.trim().toLowerCase()
  return (
    lower === 'da' ||
    lower === 'yes' ||
    lower === 'confirmă' ||
    lower === 'confirma' ||
    lower === 'ok' ||
    lower.startsWith('da,') ||
    lower.startsWith('yes,')
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function IrisPanel({ cabinetName, locale, userName }: IrisPanelProps) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isEscalating, setIsEscalating] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
      setHasUnread(false)
    }
  }, [isOpen])

  const greeting = locale === 'ro'
    ? `Bună, ${userName.split(' ')[0]}. Sunt Iris — te ajut cu orice legat de Buzomed. Ce întrebare ai?`
    : `Hi, ${userName.split(' ')[0]}. I'm Iris — here to help with anything Buzomed-related. What's your question?`

  const displayMessages = messages.length === 0
    ? [{ role: 'assistant' as const, content: greeting, id: 'greeting' }]
    : messages

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')
    const shouldEscalate =
      lastAssistantMsg &&
      looksLikeEscalationPrompt(lastAssistantMsg.content) &&
      looksLikeConfirmation(trimmed)

    const userMsg: Message = { role: 'user', content: trimmed, id: Date.now().toString() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)

    if (shouldEscalate && !escalated) {
      setIsEscalating(true)
      try {
        const summary = newMessages
          .map(m => `${m.role === 'user' ? userName : 'Iris'}: ${m.content}`)
          .join('\n')

        await fetch('/api/iris/escalate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary, currentPage: pathname, cabinetName }),
        })

        setEscalated(true)
        const confirmMsg: Message = {
          role: 'assistant',
          content: locale === 'ro'
            ? 'Am trimis conversația noastră la Colin. Vei primi răspuns la adresa ta de email în maximum 24h în zilele lucrătoare.'
            : "I've sent our conversation to Colin. You'll receive a reply at your email within 24h on working days.",
          id: Date.now().toString(),
        }
        setMessages(prev => [...prev, confirmMsg])
        if (!isOpen) setHasUnread(true)
      } catch {
        const errorMsg: Message = {
          role: 'assistant',
          content: locale === 'ro'
            ? 'Nu am putut trimite mesajul. Scrie direct la hello@buzomed.com.'
            : 'Could not send the message. Write directly to hello@buzomed.com.',
          id: Date.now().toString(),
        }
        setMessages(prev => [...prev, errorMsg])
      } finally {
        setIsLoading(false)
        setIsEscalating(false)
      }
      return
    }

    try {
      const res = await fetch('/api/iris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          currentPage: pathname,
          cabinetName,
          locale,
        }),
      })

      if (!res.ok) {
        throw new Error(`${res.status}`)
      }

      const data = await res.json()
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.reply || (locale === 'ro' ? 'Îmi pare rău, nu am putut procesa cererea.' : 'Sorry, could not process the request.'),
        id: Date.now().toString(),
      }
      setMessages(prev => [...prev, assistantMsg])
      if (!isOpen) setHasUnread(true)
    } catch {
      const errorMsg: Message = {
        role: 'assistant',
        content: locale === 'ro'
          ? 'Eroare de conexiune. Încearcă din nou.'
          : 'Connection error. Please try again.',
        id: Date.now().toString(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }, [messages, isLoading, isOpen, escalated, pathname, cabinetName, locale, userName])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleClear = () => {
    setMessages([])
    setEscalated(false)
  }

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px] md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Chat panel */}
      <div
        className={`
          fixed bottom-20 right-4 z-50
          w-[min(380px,calc(100vw-2rem))]
          flex flex-col
          rounded-xl border bg-card shadow-[0_8px_32px_-4px_rgba(15,30,63,0.14),0_0_0_1px_rgba(15,30,63,0.06)]
          overflow-hidden
          transition-all duration-200 ease-out
          ${isOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-3 pointer-events-none'
          }
        `}
        style={{ maxHeight: 'min(520px, calc(100vh - 120px))' }}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-[hsl(var(--surface-muted))]/60">
          <div className="flex items-center gap-2.5">
            <IrisAvatar size={28} />
            <div>
              <p className="text-[13px] font-medium text-foreground leading-none">Iris</p>
              <p className="text-[11px] text-[hsl(var(--text-faint))] mt-0.5">
                {locale === 'ro' ? 'Asistentul Buzomed' : 'Buzomed assistant'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                className="rounded-md px-2 py-1 text-[11px] text-[hsl(var(--text-faint))] hover:text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-muted))] transition-colors"
                title={locale === 'ro' ? 'Conversație nouă' : 'New conversation'}
              >
                {locale === 'ro' ? 'Resetează' : 'Reset'}
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1.5 text-[hsl(var(--text-faint))] hover:text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-muted))] transition-colors"
              aria-label={locale === 'ro' ? 'Închide' : 'Close'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          {displayMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {msg.role === 'assistant' && (
                <div className="shrink-0 mt-0.5">
                  <IrisAvatar size={22} />
                </div>
              )}
              <div
                className={`
                  max-w-[82%] rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap
                  ${msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-[hsl(var(--surface-muted))] text-foreground rounded-tl-sm'
                  }
                `}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-2.5">
              <div className="shrink-0 mt-0.5">
                <IrisAvatar size={22} />
              </div>
              <div className="bg-[hsl(var(--surface-muted))] rounded-xl rounded-tl-sm px-3 py-2.5">
                <div className="flex items-center gap-1">
                  {[0, 0.2, 0.4].map((delay) => (
                    <span
                      key={delay}
                      className="inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-faint))] animate-bounce"
                      style={{ animationDelay: `${delay}s`, animationDuration: '1s' }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Starter questions */}
        {messages.length === 0 && !isLoading && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5">
            {STARTERS[locale].map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-tinted))] hover:text-foreground hover:border-primary/30 transition-colors text-left"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="border-t px-3 py-2.5 bg-[hsl(var(--surface-muted))]/40">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isEscalating
                  ? (locale === 'ro' ? 'Se trimite...' : 'Sending...')
                  : (locale === 'ro' ? 'Scrie o întrebare...' : 'Ask a question...')
              }
              disabled={isLoading}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-border/60 bg-card px-3 py-2 text-[13px] leading-relaxed placeholder:text-[hsl(var(--text-faint))] focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 disabled:opacity-50 transition-colors max-h-24 overflow-y-auto"
              style={{ minHeight: '36px' }}
            />
            <Button
              size="sm"
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              className="shrink-0 h-9 w-9 p-0"
              aria-label={locale === 'ro' ? 'Trimite' : 'Send'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M12 7L2 12l2-5L2 2l10 5z" fill="currentColor" />
              </svg>
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] text-[hsl(var(--text-faint))] text-center">
            {locale === 'ro' ? 'Enter ↵ trimite · Shift+Enter linie nouă' : 'Enter ↵ to send · Shift+Enter for new line'}
          </p>
        </div>
      </div>

      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`
          fixed bottom-4 right-4 z-50
          flex items-center justify-center
          h-12 w-12 rounded-full
          bg-primary text-primary-foreground
          shadow-[0_4px_16px_-2px_rgba(15,30,63,0.28),0_1px_0_rgba(255,255,255,0.06)_inset]
          hover:bg-primary/90 active:scale-95
          transition-all duration-150
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2
        `}
        aria-label={isOpen
          ? (locale === 'ro' ? 'Închide Iris' : 'Close Iris')
          : (locale === 'ro' ? 'Deschide Iris' : 'Open Iris')
        }
      >
        {isOpen ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : (
          <IrisAvatar size={26} className="[&_circle]:stroke-white [&_line]:stroke-white [&_circle:last-child]:fill-white" />
        )}

        {/* Unread indicator */}
        {hasUnread && !isOpen && (
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[hsl(var(--accent-warning))] border-2 border-card" />
        )}
      </button>
    </>
  )
}
