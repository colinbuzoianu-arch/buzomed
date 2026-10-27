'use client'

import { ExternalLink } from 'lucide-react'
import { NonPrintingGroup, SheetMarker } from '@/components/examinations/sheet-marker'
import {
  type DosarIntakeField,
  DOSAR_SECTIONS,
  RUTA_COLS,
  RUTA_COL_MAXLEN,
  RUTA_MAX_ROWS,
  type RutaRow,
} from '@/lib/examinations/dosar-medical'
import { DOSAR_SHEET_REF } from '@/lib/examinations/periodic-sheet-map'
import { CheckField, Field, FullWidth, getStr, SelectField } from '../examination-field-components'
import type { ExaminationFormValues, Labels } from '../examination-stepper'

/**
 * Angajare-only "Dosar medical" block of the Anamneză step, in the sheet's
 * order. Identity fields come from the employee/company record (read-only, with
 * a "Corectează la angajat" link); everything else is stored on the existing
 * `anamnesis` intake_* keys and marked „Dosar".
 */

export interface DosarIdentity {
  unitate: string
  sectia: string
  nume: string
  prenume: string
  dataNasterii: string
  varsta: string
  sex: string
  adresa: string
  telefon: string
  ocupatia: string
  cnpPresent: boolean
  disabilityLabel: string | null
  employeeEditHref: string
  companyEditHref: string
}

interface Props {
  values: ExaminationFormValues
  updateJson: <K extends keyof ExaminationFormValues>(
    bucket: K,
    key: string,
    value: unknown
  ) => void
  locked: boolean
  labels: Labels
  identity: DosarIdentity
}

const YESNO = (labels: Labels) => [
  { value: '', label: '—' },
  { value: 'nu', label: labels.optNo },
  { value: 'da', label: labels.optYes },
]
const YESNOOCAZ = (labels: Labels) => [...YESNO(labels), { value: 'ocazional', label: labels.optOccasional }]

function ReadonlyRow({ label, value, missing }: { label: string; value: string; missing?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-muted-foreground">{label}:</span>
      {value ? (
        <span>{value}</span>
      ) : (
        <span className={missing ? 'text-amber-600' : 'text-muted-foreground italic'}>—</span>
      )}
    </div>
  )
}

export function DosarMedicalIntake({ values, updateJson, locked, labels, identity }: Props) {
  const ro = locked
  const an = values.anamnesis

  const field = (f: DosarIntakeField) => {
    if (f.femaleOnly && identity.sex !== 'F') return null
    const dataKey = `anamnesis.${f.key}`
    // Each Dosar field carries its own short description in the (rose) marker.
    const ref = f.hint ? { ...DOSAR_SHEET_REF, hint: f.hint } : DOSAR_SHEET_REF
    if (f.kind === 'checkbox') {
      return (
        <div key={f.key} data-sheet-key={dataKey}>
          <CheckField
            label={f.label}
            checked={Boolean(an[f.key])}
            onChange={(v) => updateJson('anamnesis', f.key, v)}
            disabled={ro}
            sheetRef={ref}
          />
        </div>
      )
    }
    if (f.kind === 'text') {
      return (
        <div key={f.key} data-sheet-key={dataKey}>
          <Field
            label={f.label}
            value={getStr(an, f.key)}
            onChange={(v) => updateJson('anamnesis', f.key, v)}
            disabled={ro}
            maxLength={f.maxLength}
            sheetRef={ref}
          />
        </div>
      )
    }
    const options =
      f.kind === 'select' ? (f.options ?? []) : f.kind === 'yesnoocaz' ? YESNOOCAZ(labels) : YESNO(labels)
    return (
      <div key={f.key} data-sheet-key={dataKey}>
        <SelectField
          label={f.label}
          value={getStr(an, f.key)}
          onChange={(v) => updateJson('anamnesis', f.key, v)}
          options={options}
          disabled={ro}
          sheetRef={ref}
        />
      </div>
    )
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-xl font-semibold">{labels.dosarTitle}</h2>
        <SheetMarker sheetRef={DOSAR_SHEET_REF} />
      </div>

      {/* Identity — from the employee/company record, read-only. */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm font-medium">{labels.dosarIdentitySection}</span>
          <span className="flex items-center gap-3 text-xs">
            <a
              href={identity.employeeEditHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {labels.dosarFixEmployee}
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={identity.companyEditHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {labels.dosarFixCompany}
              <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          <ReadonlyRow label="Unitate" value={identity.unitate} />
          <ReadonlyRow label="Secția" value={identity.sectia} />
          <ReadonlyRow label="Ocupația" value={identity.ocupatia} />
          <ReadonlyRow label="Nume" value={identity.nume} />
          <ReadonlyRow label="Prenume" value={identity.prenume} />
          <ReadonlyRow label="Sex" value={identity.sex} />
          <ReadonlyRow label="Data nașterii" value={identity.dataNasterii} missing />
          <ReadonlyRow label="Vârsta" value={identity.varsta} />
          <ReadonlyRow
            label="CNP"
            value={identity.cnpPresent ? labels.dosarCnpPresent : ''}
            missing
          />
          <ReadonlyRow label="Adresă" value={identity.adresa} missing />
          <ReadonlyRow label="Telefon" value={identity.telefon} />
          <ReadonlyRow
            label="Handicap"
            value={identity.disabilityLabel ?? labels.optNo}
          />
        </div>
      </div>

      {/* Ruta profesională */}
      <RutaTable values={values} updateJson={updateJson} locked={ro} labels={labels} />

      {/* Declarative intake sections */}
      {DOSAR_SECTIONS.map((section) => {
        const rendered = section.fields.map(field).filter(Boolean)
        if (rendered.length === 0) return null
        return (
          <div key={section.key} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{section.title}</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{rendered}</div>
          </div>
        )
      })}

      {/* Clinical anamnesis free-text — kept in the record, never on the dosar. */}
      <NonPrintingGroup active heading={labels.sheetNonPrinting}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FullWidth>
            <Field
              label={labels.fieldGeneralHistory}
              value={getStr(an, 'general')}
              onChange={(v) => updateJson('anamnesis', 'general', v)}
              multiline
              disabled={ro}
            />
          </FullWidth>
          <Field
            label={labels.fieldChronicConditions}
            value={getStr(an, 'chronicConditions')}
            onChange={(v) => updateJson('anamnesis', 'chronicConditions', v)}
            multiline
            disabled={ro}
          />
          <Field
            label={labels.fieldMedications}
            value={getStr(an, 'medications')}
            onChange={(v) => updateJson('anamnesis', 'medications', v)}
            multiline
            disabled={ro}
          />
          <Field
            label={labels.fieldAllergies}
            value={getStr(an, 'allergies')}
            onChange={(v) => updateJson('anamnesis', 'allergies', v)}
            multiline
            disabled={ro}
          />
          <FullWidth>
            <Field
              label={labels.fieldOccupationalHistory}
              value={getStr(an, 'occupationalHistory')}
              onChange={(v) => updateJson('anamnesis', 'occupationalHistory', v)}
              multiline
              disabled={ro}
            />
          </FullWidth>
          <FullWidth>
            <Field
              label={labels.fieldAdditionalNotes}
              value={getStr(an, 'additionalNotes')}
              onChange={(v) => updateJson('anamnesis', 'additionalNotes', v)}
              multiline
              disabled={ro}
            />
          </FullWidth>
        </div>
      </NonPrintingGroup>
    </section>
  )
}

function RutaTable({
  values,
  updateJson,
  locked,
  labels,
}: {
  values: ExaminationFormValues
  updateJson: Props['updateJson']
  locked: boolean
  labels: Labels
}) {
  const stored = values.anamnesis.intake_ruta_profesionala
  const legacyText = typeof stored === 'string' ? stored.trim() : ''
  const rows: RutaRow[] = Array.from({ length: RUTA_MAX_ROWS }, (_, i) => {
    const r = Array.isArray(stored) ? (stored[i] as Partial<RutaRow> | undefined) : undefined
    return {
      firma: r?.firma ?? '',
      post: r?.post ?? '',
      perioada: r?.perioada ?? '',
      functia: r?.functia ?? '',
      noxa: r?.noxa ?? '',
    }
  })

  function setCell(rowIdx: number, col: (typeof RUTA_COLS)[number], v: string) {
    const next = rows.map((x) => ({ ...x }))
    next[rowIdx][col] = v
    updateJson('anamnesis', 'intake_ruta_profesionala', next)
  }

  return (
    <div className="space-y-2" data-sheet-key="anamnesis.intake_ruta_profesionala">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-muted-foreground">{labels.dosarRutaTitle}</h3>
        <SheetMarker sheetRef={DOSAR_SHEET_REF} />
      </div>
      {legacyText && (
        <p className="text-xs text-amber-600">
          {labels.dosarRutaLegacy}: {legacyText}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-1 pr-2 font-medium">Firma</th>
              <th className="pb-1 pr-2 font-medium">Post de muncă</th>
              <th className="pb-1 pr-2 font-medium">Perioadă</th>
              <th className="pb-1 pr-2 font-medium">Funcția</th>
              <th className="pb-1 font-medium">Noxa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 4-row table
              <tr key={i}>
                {RUTA_COLS.map((col) => (
                  <td key={col} className="pr-2 pb-1">
                    <input
                      type="text"
                      value={row[col]}
                      maxLength={RUTA_COL_MAXLEN[col]}
                      disabled={locked}
                      onChange={(e) => setCell(i, col, e.target.value)}
                      className="h-8 w-full min-w-[6rem] rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
