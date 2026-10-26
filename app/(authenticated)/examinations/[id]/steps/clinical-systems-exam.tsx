'use client'

import { CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  CLINICAL_ALL_NORMAL_ITEMS,
  CLINICAL_CONCLUSION_ITEMS,
  CLINICAL_EXAM_SECTIONS,
  CLINICAL_EXAM_TEXT_DEFAULTS,
  type ClinicalChoiceItem,
  type ClinicalItem,
  type ClinicalSection,
  type ClinicalTextItem,
  effectiveSource,
} from '@/lib/examinations/clinical-exam'
import { toastSuccess } from '@/lib/toast'
import { getStr } from '../examination-field-components'
import type { ExaminationFormValues, Labels } from '../examination-stepper'

/**
 * Periodic-only "Examen clinic pe aparate și sisteme" block (Clinic step).
 *
 * Renders sections 1–11 of the official periodic sheet from the single
 * definition in lib/examinations/clinical-exam.ts. Systems-exam items are
 * stored on `clinicalExam`; sections 6 and 10 reuse the EXISTING vitals /
 * vision / hearing state (bound, never copied) — a value is never stored
 * twice. The "Toate aparatele în limite normale" button fills only unset
 * clinicalExam items (choices → normal, texts → their default) plus the
 * conclusion; it never overwrites the doctor's entries and never touches
 * vitals, vision values, asymptomatic or voice.
 */

type UpdateJson = <K extends keyof ExaminationFormValues>(
  bucket: K,
  key: string,
  value: unknown
) => void

interface Props {
  values: ExaminationFormValues
  updateJson: UpdateJson
  locked: boolean
  labels: Labels
}

function readValue(values: ExaminationFormValues, item: ClinicalItem): string {
  const bucket = values[effectiveSource(item)] as Record<string, unknown>
  return getStr(bucket ?? {}, item.key)
}

function readNote(values: ExaminationFormValues, noteKey: string): string {
  return getStr(values.clinicalExam ?? {}, noteKey)
}

/**
 * A section counts as "normal" (→ green badge, starts collapsed) only when it
 * has actually been filled to its normal state — every choice item with a
 * declared normal is SET to that normal, every text item with a default is SET
 * to that default, conditional items are untriggered, and no note is filled.
 * An unset/blank section is NOT normal, so a fresh exam stays expanded.
 */
function isSectionNormal(values: ExaminationFormValues, section: ClinicalSection): boolean {
  for (const item of section.items) {
    const val = readValue(values, item)
    if (item.kind === 'choice') {
      if (item.normal) {
        if (val !== item.normal) return false
      } else if (val !== '') {
        // Conditional item (e.g. abdomenPalpare) is triggered → not normal.
        return false
      }
      if (item.noteKey && readNote(values, item.noteKey) !== '') return false
    } else {
      const def = CLINICAL_EXAM_TEXT_DEFAULTS[item.key]
      // Text with a default must equal it; text without a default (near
      // vision) doesn't block the section from reading as normal.
      if (def !== undefined && val !== def) return false
    }
  }
  return true
}

export function ClinicalSystemsExam({ values, updateJson, locked, labels }: Props) {
  const ro = locked

  // Per-section expand state; normal sections start collapsed to save height.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const s of CLINICAL_EXAM_SECTIONS) init[s.key] = !isSectionNormal(values, s)
    return init
  })

  function handleAllNormal() {
    const current = values.clinicalExam ?? {}
    let count = 0
    for (const item of CLINICAL_ALL_NORMAL_ITEMS) {
      const cur = getStr(current, item.key)
      if (cur !== '') continue
      if (item.kind === 'choice') {
        if (item.normal) {
          updateJson('clinicalExam', item.key, item.normal)
          count++
        }
      } else {
        const def = CLINICAL_EXAM_TEXT_DEFAULTS[item.key]
        if (def) {
          updateJson('clinicalExam', item.key, def)
          count++
        }
      }
    }
    toastSuccess(labels.clinExamAllNormalToast.replace('{count}', String(count)))
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-semibold">{labels.clinExamSystemsTitle}</h2>
        {!ro && (
          <Button type="button" variant="outline" size="sm" onClick={handleAllNormal}>
            <CheckCheck className="h-4 w-4" />
            {labels.clinExamAllNormal}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {CLINICAL_EXAM_SECTIONS.map((section) => {
          const open = expanded[section.key]
          const normal = isSectionNormal(values, section)
          return (
            <div key={section.key} className="rounded-lg border bg-card">
              <button
                type="button"
                onClick={() => setExpanded((p) => ({ ...p, [section.key]: !p[section.key] }))}
                className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-muted-foreground tabular-nums">{section.number}.</span>
                  {section.label}
                  {!open && normal && (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-normal text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                      ✓ {labels.clinExamNormalLine}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {open ? '▲' : `${labels.clinExamEdit} ▾`}
                </span>
              </button>

              {open && (
                <div className="space-y-3 border-t px-4 py-3">
                  {/* Section 6 echoes the existing vitals TA/AV (bound state). */}
                  {section.key === 'aparatCardiovascular' && (
                    <VitalEcho
                      text={`TA: ${vitalEchoBp(values)} · AV: ${getStr(values.vitalSigns, 'pulse') || '—'}`}
                    />
                  )}
                  {/* Section 10 echoes the distance visual acuity (bound state). */}
                  {section.key === 'analizatori' && (
                    <VitalEcho
                      text={`AV distanță — OD: ${getStr(values.visionTest, 'right') || '—'} · OS: ${getStr(values.visionTest, 'left') || '—'}`}
                    />
                  )}

                  {section.items.map((item) => (
                    <ClinicalItemRow
                      key={`${effectiveSource(item)}.${item.key}`}
                      item={item}
                      values={values}
                      updateJson={updateJson}
                      disabled={ro}
                      labels={labels}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Concluzii examen clinic */}
      <div className="rounded-lg border bg-card px-4 py-3 space-y-3">
        <h3 className="text-sm font-semibold">{labels.clinExamConclusionTitle}</h3>
        {CLINICAL_CONCLUSION_ITEMS.map((item) => (
          <ClinicalItemRow
            key={item.key}
            item={item}
            values={values}
            updateJson={updateJson}
            disabled={ro}
            labels={labels}
          />
        ))}
      </div>
    </section>
  )
}

function vitalEchoBp(values: ExaminationFormValues): string {
  const sys = getStr(values.vitalSigns, 'bpSystolic')
  const dia = getStr(values.vitalSigns, 'bpDiastolic')
  return sys || dia ? `${sys || '—'}/${dia || '—'}` : '—'
}

function VitalEcho({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground tabular-nums">{text}</div>
}

function ClinicalItemRow({
  item,
  values,
  updateJson,
  disabled,
  labels,
}: {
  item: ClinicalItem
  values: ExaminationFormValues
  updateJson: UpdateJson
  disabled: boolean
  labels: Labels
}) {
  const source = effectiveSource(item)
  const value = readValue(values, item)

  // Conditional sub-item: "La palpare" shows only when abdomen is dureros.
  if (item.key === 'abdomenPalpare' && getStr(values.clinicalExam ?? {}, 'abdomen') !== 'dureros') {
    return null
  }

  if (item.kind === 'text') {
    return (
      <TextRow
        item={item}
        value={value}
        onChange={(v) => updateJson(source, item.key, v)}
        disabled={disabled}
      />
    )
  }

  const choice = item as ClinicalChoiceItem
  const selectedOption = choice.options.find((o) => o.value === value)
  // A note is relevant once an abnormal option is picked. It's required when
  // that option prints no checkbox of its own (single-normal + note items).
  const showNote =
    source === 'clinicalExam' && !!choice.noteKey && value !== '' && value !== choice.normal
  const noteRequired = showNote && selectedOption !== undefined && selectedOption.checkboxKey === undefined

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-sm min-w-[7rem]">{item.label}</span>
        <Segmented
          options={choice.options}
          value={value}
          onChange={(v) => updateJson(source, choice.key, v)}
          disabled={disabled}
        />
      </div>
      {showNote && choice.noteKey && (
        <NoteRow
          noteKey={choice.noteKey}
          maxLength={choice.noteMaxLength ?? 0}
          value={readNote(values, choice.noteKey)}
          onChange={(v) => updateJson('clinicalExam', choice.noteKey as string, v)}
          disabled={disabled}
          required={noteRequired}
          labels={labels}
        />
      )}
    </div>
  )
}

function Segmented({
  options,
  value,
  onChange,
  disabled,
}: {
  options: ClinicalChoiceItem['options']
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <div className="inline-flex flex-wrap gap-1">
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? '' : o.value)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-60 ${
              active
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-input text-muted-foreground hover:bg-muted'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function TextRow({
  item,
  value,
  onChange,
  disabled,
}: {
  item: ClinicalTextItem
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  const placeholder = CLINICAL_EXAM_TEXT_DEFAULTS[item.key] ?? ''
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-sm min-w-[7rem]">{item.label}</span>
      <div className="flex-1 min-w-[10rem]">
        <input
          type="text"
          value={value}
          maxLength={item.maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
        />
      </div>
      <Counter length={value.length} max={item.maxLength} />
    </div>
  )
}

function NoteRow({
  noteKey,
  maxLength,
  value,
  onChange,
  disabled,
  required,
  labels,
}: {
  noteKey: string
  maxLength: number
  value: string
  onChange: (v: string) => void
  disabled: boolean
  required: boolean
  labels: Labels
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[7rem]">
      <div className="flex-1 min-w-[10rem]">
        <input
          type="text"
          value={value}
          maxLength={maxLength || undefined}
          placeholder={labels.clinExamNotePlaceholder}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={`${noteKey} ${labels.clinExamNotePlaceholder}`}
          className={`h-8 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-60 ${
            required && value.trim() === '' ? 'border-amber-400' : 'border-input'
          }`}
        />
      </div>
      {required && value.trim() === '' && (
        <span className="text-xs text-amber-600">{labels.clinExamNoteRequired}</span>
      )}
      {maxLength > 0 && <Counter length={value.length} max={maxLength} />}
    </div>
  )
}

function Counter({ length, max }: { length: number; max: number }) {
  return (
    <span
      className={`text-[11px] tabular-nums shrink-0 ${
        length > max ? 'text-destructive' : 'text-muted-foreground/60'
      }`}
    >
      {length}/{max}
    </span>
  )
}
