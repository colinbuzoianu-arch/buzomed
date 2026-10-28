'use client'

import { Send } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { IrisAvatar } from '@/components/iris/iris-avatar'
import { buildIrisQA, IRIS_FREE_TEXT_REPLY } from '@/lib/sandbox/iris'
import { useSandboxStore } from '@/lib/sandbox/store'

interface Message {
  role: 'user' | 'iris'
  text: string
}

export default function SandboxIrisPage() {
  const { data } = useSandboxStore()
  const qa = useMemo(() => buildIrisQA(data), [data])

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'iris',
      text: 'Bună! Sunt Iris, asistentul cabinetului. Alegeți una dintre întrebările sugerate ca să vedeți cum răspund pe baza datelor dumneavoastră.',
    },
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to bottom on each new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Clear any pending stream timers on unmount.
  useEffect(() => {
    const t = timers.current
    return () => {
      for (const id of t) clearTimeout(id)
    }
  }, [])

  function streamAnswer(answer: string) {
    setStreaming(true)
    setMessages((m) => [...m, { role: 'iris', text: '' }])
    const tokens = answer.match(/\S+\s*/g) ?? [answer]
    let acc = ''
    tokens.forEach((tok, i) => {
      const id = setTimeout(
        () => {
          acc += tok
          setMessages((m) => {
            const next = m.slice()
            next[next.length - 1] = { role: 'iris', text: acc }
            return next
          })
          if (i === tokens.length - 1) setStreaming(false)
        },
        45 * (i + 1)
      )
      timers.current.push(id)
    })
  }

  function ask(question: string, answer: string) {
    if (streaming) return
    setMessages((m) => [...m, { role: 'user', text: question }])
    streamAnswer(answer)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text }])
    streamAnswer(IRIS_FREE_TEXT_REPLY)
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-14rem)] max-w-2xl flex-col">
      <div className="flex items-center gap-3 border-b pb-3">
        <IrisAvatar size={36} />
        <div>
          <h1 className="text-lg font-semibold leading-tight">Iris</h1>
          <p className="text-xs text-muted-foreground">Asistentul cabinetului · demo</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-4">
        {messages.map((m, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only chat log
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[82%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                m.role === 'user'
                  ? 'rounded-tr-sm bg-primary text-primary-foreground'
                  : 'rounded-tl-sm bg-[hsl(var(--surface-muted))] text-foreground'
              }`}
            >
              {m.text || '…'}
            </div>
          </div>
        ))}
      </div>

      {/* Suggested questions */}
      <div className="flex flex-wrap gap-2 py-2">
        {qa.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={streaming}
            onClick={() => ask(item.question, item.answer)}
            className="rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] text-[hsl(var(--text-muted))] transition-colors hover:border-primary/30 hover:bg-[hsl(var(--surface-tinted))] hover:text-foreground disabled:opacity-50"
          >
            {item.question}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t pt-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
          rows={1}
          placeholder="Scrieți o întrebare…"
          className="max-h-24 flex-1 resize-none overflow-y-auto rounded-lg border border-border/60 bg-card px-3 py-2 text-[13px] leading-relaxed placeholder:text-[hsl(var(--text-faint))] focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          aria-label="Trimite"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
