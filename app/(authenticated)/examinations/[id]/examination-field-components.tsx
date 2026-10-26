'use client'

import { useEffect, useState } from 'react'
import { SheetMarker } from '@/components/examinations/sheet-marker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SheetRef } from '@/lib/examinations/periodic-sheet-map'

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
  sheetRef,
  children,
}: {
  title: string
  hazardHint?: string
  sheetRef?: SheetRef
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-xl font-semibold">{title}</h2>
        {sheetRef && <SheetMarker sheetRef={sheetRef} />}
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
  sheetRef,
  maxLength,
  example,
  hint,
  smallBoxHint,
  dataSheetKey,
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
  sheetRef?: SheetRef
  /** When set, caps input and shows an n/max counter (amber from 80%). */
  maxLength?: number
  /** Short example shown as placeholder, prefixed „ex: ". */
  example?: string
  /** One-line muted help under the field. */
  hint?: string
  /** Shown when the printed box is tiny (maxLength ≤ 15). */
  smallBoxHint?: string
  /** Jump target for the pre-sign checklist. */
  dataSheetKey?: string
}) {
  const id = label.replace(/\s+/g, '-').toLowerCase()
  const placeholder = example ? `ex: ${example}` : undefined
  const overWarn = maxLength !== undefined && maxLength > 0 && value.length >= maxLength * 0.8
  return (
    <div
      data-sheet-key={dataSheetKey}
      className={`space-y-2${highlighted ? ' border-l-4 border-amber-400 pl-2' : ''}`}
      title={highlighted ? highlightTooltip : undefined}
    >
      {sheetRef ? (
        <div className="flex items-center gap-2 flex-wrap">
          <Label htmlFor={id}>{label}</Label>
          <SheetMarker sheetRef={sheetRef} />
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
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
          maxLength={maxLength}
          placeholder={placeholder}
        />
      )}
      {(hint || maxLength !== undefined) && (
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">{hint}</p>
          {maxLength !== undefined && (
            <span
              className={`text-[11px] tabular-nums shrink-0 ${
                overWarn ? 'text-amber-600' : 'text-muted-foreground/60'
              }`}
            >
              {value.length}/{maxLength}
            </span>
          )}
        </div>
      )}
      {maxLength !== undefined && maxLength <= 15 && smallBoxHint && (
        <p className="text-[11px] text-muted-foreground">{smallBoxHint}</p>
      )}
    </div>
  )
}

/**
 * Compact labeled input for the dense periodic Clinic layout: a tiny label
 * (with optional sheet marker) above a narrow input, so many fields fit on one
 * wrapping row. Optional unit, character counter (amber from 80%), example
 * placeholder and a one-line hint — same semantics as `Field`, just small.
 */
export function CompactField({
  label,
  value,
  onChange,
  type = 'text',
  step,
  unit,
  disabled,
  sheetRef,
  maxLength,
  example,
  hint,
  widthClass = 'w-16',
  dataSheetKey,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  step?: string
  unit?: string
  disabled?: boolean
  sheetRef?: SheetRef
  maxLength?: number
  example?: string
  hint?: string
  widthClass?: string
  dataSheetKey?: string
}) {
  const id = `c-${label.replace(/\s+/g, '-').toLowerCase()}`
  const overWarn = maxLength !== undefined && maxLength > 0 && value.length >= maxLength * 0.8
  return (
    <div data-sheet-key={dataSheetKey} className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {sheetRef && <SheetMarker sheetRef={sheetRef} />}
      </span>
      <div className="inline-flex items-center gap-1">
        <input
          id={id}
          type={type}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={example ? `ex: ${example}` : undefined}
          className={`h-8 ${widthClass} rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60`}
        />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        {maxLength !== undefined && (
          <span
            className={`text-[11px] tabular-nums shrink-0 ${
              overWarn ? 'text-amber-600' : 'text-muted-foreground/60'
            }`}
          >
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
  sheetRef,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
  sheetRef?: SheetRef
}) {
  const id = label.replace(/\s+/g, '-').toLowerCase()
  return (
    <div className="space-y-2">
      {sheetRef ? (
        <div className="flex items-center gap-2 flex-wrap">
          <Label htmlFor={id}>{label}</Label>
          <SheetMarker sheetRef={sheetRef} />
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
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
  sheetRef,
  dataSheetKey,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  optYes: string
  optNo: string
  disabled?: boolean
  sheetRef?: SheetRef
  dataSheetKey?: string
}) {
  const name = `yn-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div data-sheet-key={dataSheetKey} className="flex items-center justify-between px-3 py-2">
      {sheetRef ? (
        <span className="text-sm pr-4 inline-flex items-center gap-2">
          {label}
          <SheetMarker sheetRef={sheetRef} />
        </span>
      ) : (
        <span className="text-sm pr-4">{label}</span>
      )}
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
  sheetRef,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  sheetRef?: SheetRef
}) {
  const field = (
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
  if (!sheetRef) return field
  return (
    <div className="flex items-center gap-2">
      {field}
      <SheetMarker sheetRef={sheetRef} />
    </div>
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
