'use client'

import { Printer } from 'lucide-react'
import { type SheetRef, shortWhere } from '@/lib/examinations/periodic-sheet-map'

/**
 * Small "Pe foaie · §N" pill shown next to inputs that print on the periodic
 * sheet. Renders nothing for a non-printing ref, so callers can pass the ref
 * unconditionally. The tooltip (full location + hint) shows on hover AND
 * keyboard focus via a pure-CSS popover, with a native `title` as fallback.
 */
export function SheetMarker({ sheetRef }: { sheetRef?: SheetRef }) {
  if (!sheetRef?.printed || !sheetRef.where) return null
  const label = shortWhere(sheetRef.where)
  const tip = [sheetRef.where, sheetRef.hint].filter(Boolean).join(' — ')
  // Deliberately a non-interactive <span>, not a <button>: these markers sit
  // inside other buttons (e.g. the systems-exam section toggle) and a nested
  // <button> is invalid HTML that breaks hydration in production. The hover
  // tooltip is pure CSS, with `title` as the universal fallback and an sr-only
  // label for screen readers.
  return (
    <span className="group/sm relative inline-flex align-middle">
      <span
        title={tip}
        className="inline-flex cursor-help items-center gap-1 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] leading-none text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300"
      >
        <Printer className="h-3 w-3 shrink-0" aria-hidden="true" />
        {label}
        <span className="sr-only">Pe foaie: {tip}</span>
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-56 rounded-md border bg-popover px-2 py-1 text-xs font-normal text-popover-foreground shadow-md group-hover/sm:block"
      >
        {tip}
      </span>
    </span>
  )
}

/**
 * Wraps inputs that do NOT print on the sheet in a muted, dashed-border block
 * headed "Doar în dosarul din Buzomed — nu apare pe foaie". When `active` is
 * false (every non-periodic exam) it renders its children unchanged, so other
 * exam types are byte-for-byte identical to before.
 */
export function NonPrintingGroup({
  active,
  heading,
  children,
  className,
}: {
  active: boolean
  heading: string
  children: React.ReactNode
  className?: string
}) {
  if (!active) return <>{children}</>
  return (
    <div
      className={`rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-3 ${className ?? ''}`}
    >
      <p className="mb-3 text-xs font-medium text-muted-foreground">{heading}</p>
      {children}
    </div>
  )
}
