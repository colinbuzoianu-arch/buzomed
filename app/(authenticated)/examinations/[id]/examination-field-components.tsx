'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Shared field primitives + small value helpers used by every step of the
 * examination stepper. Extracted from the pre-stepper examination-form.tsx
 * so behavior (including the AI-prefill highlight styling) stays identical.
 */

export function getStr(o: Record<string, unknown>, k: string): string {
  const v = o[k]
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

export function getNum(o: Record<string, unknown>, k: string): string {
  const v = o[k]
  if (v === null || v === undefined || v === '') return ''
  return String(v)
}

/** Pure BMI derivation shared between the ClinicalStep display and the save payload. */
export function calculateBmi(vitalSigns: Record<string, unknown>): string {
  const h = parseFloat(getStr(vitalSigns, 'height'))
  const w = parseFloat(getStr(vitalSigns, 'weight'))
  if (!h || !w || h <= 0) return ''
  const meters = h > 3 ? h / 100 : h
  return (w / (meters * meters)).toFixed(1)
}

export function FormSection({
  title,
  hazardHint,
  children,
}: {
  title: string
  hazardHint?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        {hazardHint && (
          <span
            title={hazardHint}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"
          >
            ⚑ {hazardHint}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  )
}

export function FullWidth({ children }: { children: React.ReactNode }) {
  return <div className="md:col-span-2">{children}</div>
}

export function Field({
  label,
  value,
  onChange,
  multiline,
  type = 'text',
  step,
  disabled,
  highlighted,
  highlightTooltip,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  type?: string
  step?: string
  disabled?: boolean
  highlighted?: boolean
  highlightTooltip?: string
}) {
  const id = label.replace(/\s+/g, '-').toLowerCase()
  return (
    <div
      className={`space-y-2${highlighted ? ' border-l-4 border-amber-400 pl-2' : ''}`}
      title={highlighted ? highlightTooltip : undefined}
    >
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        />
      ) : (
        <Input
          id={id}
          type={type}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  const id = label.replace(/\s+/g, '-').toLowerCase()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function YesNoField({
  label,
  value,
  onChange,
  optYes,
  optNo,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  optYes: string
  optNo: string
  disabled?: boolean
}) {
  const name = `yn-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-sm pr-4">{label}</span>
      <div className="flex items-center gap-4 shrink-0">
        {(['da', 'nu'] as const).map((v) => (
          <label
            key={v}
            className={`flex items-center gap-1.5 text-sm ${
              disabled ? 'opacity-60' : 'cursor-pointer'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              disabled={disabled}
            />
            {v === 'da' ? optYes : optNo}
          </label>
        ))}
      </div>
    </div>
  )
}

export function CheckField({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  )
}

export function DiagnosesField({
  label,
  help,
  value,
  onChange,
  disabled,
}: {
  label: string
  help: string
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
}) {
  // Stored as array of strings — entered as a textarea with one per line.
  const [text, setText] = useState(value.join('\n'))
  function commit() {
    const lines = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    onChange(lines)
  }
  useEffect(() => {
    setText(value.join('\n'))
  }, [value])
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        disabled={disabled}
        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
      />
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  )
}
