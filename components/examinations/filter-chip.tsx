'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A select-backed filter chip, shared by the examinations list filter bar and
 * the avize register filter bar. Shows the label, highlights when a value is
 * chosen, and renders an inline × to clear it. The native <select> passed as
 * children carries the `chip-select` class and is laid over the chip so a
 * click anywhere opens it.
 */
export function FilterChip({
  label,
  value,
  onClear,
  children,
}: {
  label: string
  value?: string
  onClear: () => void
  children: React.ReactNode
}) {
  const active = Boolean(value)
  return (
    <span
      className={cn(
        'relative inline-flex items-center rounded-md border text-sm transition-colors',
        active ? 'border-primary/40 bg-[hsl(var(--surface-tinted))] text-primary' : 'hover:bg-muted'
      )}
    >
      <span className="[&_.chip-select]:h-9 [&_.chip-select]:cursor-pointer [&_.chip-select]:appearance-none [&_.chip-select]:bg-transparent [&_.chip-select]:px-3 [&_.chip-select]:pr-7 [&_.chip-select]:text-sm [&_.chip-select]:outline-none">
        {children}
      </span>
      {active ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={`${label} ×`}
          className="absolute right-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary/10"
        >
          <X className="h-3 w-3" />
        </button>
      ) : (
        <span aria-hidden className="pointer-events-none absolute right-2 text-muted-foreground">
          ▾
        </span>
      )}
    </span>
  )
}
