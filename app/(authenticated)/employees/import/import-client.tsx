'use client'

import { TOAST } from '@/lib/toast'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  parseImportFile,
  validateRow,
  aiEnhancedColumnMapping,
  type RawRow,
  type ColumnMapping,
  type ColumnKey,
} from '@/lib/employees/import-parser'

interface Workplace {
  id: string
  name: string
  department: string | null
}

interface Company {
  id: string
  name: string
  workplaces: Workplace[]
}

interface Props {
  companies: Company[]
  locale: 'ro' | 'en'
  labels: Record<string, string>
}

interface AnnotatedRow extends RawRow {
  issues: string[]
  warnings: string[]
  duplicateNameMatch: boolean
  duplicateEmailMatch: boolean
  workplaceMatched: boolean
  workplaceId: string | null
}

interface DiffResult {
  currentCount: number
  new: Array<{ rowNumber: number; firstName: string; lastName: string; toWorkplace: string | null }>
  leaving: Array<{ id: string; firstName: string; lastName: string; workplace: string }>
  moved: Array<{ rowNumber: number; firstName: string; lastName: string; fromWorkplace: string; toWorkplace: string }>
  unchanged: number
}

type Phase = 'idle' | 'previewing' | 'committing' | 'done'

const COLUMN_KEYS: ColumnKey[] = [
  'firstName',
  'lastName',
  'companyEmployeeId',
  'email',
  'department',
]

function colKeyLabel(key: ColumnKey, labels: Record<string, string>): string {
  switch (key) {
    case 'firstName': return labels.colFirstName
    case 'lastName': return labels.colLastName
    case 'companyEmployeeId': return labels.colEmployeeId
    case 'email': return labels.colEmail
    case 'department': return labels.colDepartment
  }
}

function matchWorkplace(company: Company, dept: string | null): Workplace | null {
  if (!dept) return null
  const key = dept.toLowerCase().trim()
  for (const w of company.workplaces) {
    if (w.department && w.department.toLowerCase() === key) return w
  }
  for (const w of company.workplaces) {
    if (w.name.toLowerCase() === key) return w
  }
  return null
}

function headerToCurrentKey(header: string, mapping: ColumnMapping): ColumnKey | null {
  for (const [key, h] of Object.entries(mapping.detected) as Array<[ColumnKey, string]>) {
    if (h === header) return key
  }
  return null
}

function reapplyMapping(originalRows: RawRow[], newMapping: ColumnMapping): RawRow[] {
  return originalRows.map((row) => {
    const get = (col: ColumnKey): string | null => {
      const sourceHeader = newMapping.detected[col]
      if (!sourceHeader) return null
      const v = row.raw[sourceHeader]
      if (v === undefined || v === null) return null
      const trimmed = String(v).trim()
      return trimmed === '' ? null : trimmed
    }
    return {
      ...row,
      firstName: get('firstName'),
      lastName: get('lastName'),
      companyEmployeeId: get('companyEmployeeId'),
      email: get('email'),
      department: get('department'),
    }
  })
}

function annotateRows(remappedRows: RawRow[], company: Company): AnnotatedRow[] {
  const seenNames = new Set<string>()
  const seenEmails = new Set<string>()
  return remappedRows.map((row) => {
    const v = validateRow(row)
    const wp = matchWorkplace(company, row.department)
    const issues = [...v.issues]
    const warnings = [...v.warnings]

    if (row.department && !wp) {
      issues.push('workplace_not_found')
    }

    const nameKey = `${row.firstName?.toLowerCase()}|${row.lastName?.toLowerCase()}`
    const emailKey = row.email?.toLowerCase() ?? null
    const dupName = seenNames.has(nameKey)
    const dupEmail = emailKey ? seenEmails.has(emailKey) : false
    if (dupName) warnings.push('duplicate_within_file_name')
    if (dupEmail) warnings.push('duplicate_within_file_email')
    if (row.firstName && row.lastName) seenNames.add(nameKey)
    if (emailKey) seenEmails.add(emailKey)

    return {
      ...row,
      issues,
      warnings,
      duplicateNameMatch: false,
      duplicateEmailMatch: false,
      workplaceMatched: !!wp,
      workplaceId: wp?.id ?? null,
    }
  })
}

export function ImportClient({ companies, locale, labels }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Incremented on every new file select or reset; used to ignore stale AI responses.
  const aiGenRef = useRef(0)

  const [companyId, setCompanyId] = useState<string>(
    companies.length === 1 ? companies[0].id : ''
  )
  const [phase, setPhase] = useState<Phase>('idle')
  const [rows, setRows] = useState<AnnotatedRow[]>([])
  const [rawRows, setRawRows] = useState<RawRow[]>([])
  const [fileHeaders, setFileHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [aiMappingLoading, setAiMappingLoading] = useState(false)
  const [aiMappingFailed, setAiMappingFailed] = useState(false)
  const [aiUsed, setAiUsed] = useState(false)
  const [aiConfidence, setAiConfidence] = useState<
    Partial<Record<ColumnKey, 'high' | 'medium' | 'low'>>
  >({})
  const [commitResult, setCommitResult] = useState<{
    summary: {
      total: number
      created: number
      skipped: number
      failed: number
    }
    results: Array<{
      rowNumber: number
      outcome: 'created' | 'skipped' | 'failed'
      reason?: string
    }>
  } | null>(null)

  const selectedCompany = companies.find((c) => c.id === companyId)

  function runDiff(cid: string, annotated: AnnotatedRow[]) {
    const validForDiff = annotated.filter(
      (r) => r.issues.length === 0 && r.firstName && r.lastName
    )
    if (validForDiff.length === 0) return
    setDiffLoading(true)
    setDiffResult(null)
    fetch('/api/employees/import/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: cid,
        rows: validForDiff.map((r) => ({
          rowNumber: r.rowNumber,
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          companyEmployeeId: r.companyEmployeeId,
          department: r.department,
        })),
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DiffResult | null) => { if (data) setDiffResult(data) })
      .catch(() => {})
      .finally(() => setDiffLoading(false))
  }

  async function handleFileSelect(file: File) {
    if (!companyId || !selectedCompany) {
      setError(labels.errorNoCompany)
      return
    }
    const company = selectedCompany // capture at call time
    setError(null)
    setParseErrors([])
    setPhase('previewing')
    setAiUsed(false)
    setAiConfidence({})
    setAiMappingFailed(false)
    aiGenRef.current++
    const myGen = aiGenRef.current

    try {
      let result: Awaited<ReturnType<typeof parseImportFile>>
      const isExcel =
        file.name.toLowerCase().endsWith('.xlsx') ||
        file.name.toLowerCase().endsWith('.xls')
      if (isExcel) {
        const buffer = await file.arrayBuffer()
        result = await parseImportFile({ buffer, filename: file.name })
      } else {
        const text = await file.text()
        result = await parseImportFile({ text })
      }

      setMapping(result.mapping)
      setParseErrors(result.parseErrors)
      setRawRows(result.rows)

      // Reconstruct ordered headers from the first row's raw data.
      const headers =
        result.rows.length > 0
          ? Object.keys(result.rows[0].raw)
          : [
              ...Object.values(result.mapping.detected),
              ...result.mapping.unmappedHeaders,
            ]
      setFileHeaders(headers)

      const annotated = annotateRows(result.rows, company)
      setRows(annotated)
      runDiff(companyId, annotated)

      // Trigger AI column mapping when ≥2 required columns are undetected.
      if (result.mapping.missingColumns.length >= 2) {
        setAiMappingLoading(true)
        aiEnhancedColumnMapping(headers, result.mapping)
          .then((aiResult) => {
            if (aiGenRef.current !== myGen) return // stale — user reset or re-uploaded
            if (!aiResult.aiUsed) {
              setAiMappingFailed(true)
              return
            }
            setMapping(aiResult.mapping)
            setAiUsed(true)
            setAiConfidence(aiResult.confidence)
            const remapped = reapplyMapping(result.rows, aiResult.mapping)
            const reAnnotated = annotateRows(remapped, company)
            setRows(reAnnotated)
            runDiff(companyId, reAnnotated)
          })
          .finally(() => {
            if (aiGenRef.current === myGen) setAiMappingLoading(false)
          })
      }
    } catch (err) {
      console.error('Parse error', err)
      setError(labels.errorParse)
      setPhase('idle')
    }
  }

  function handleMappingOverride(sourceHeader: string, newKey: ColumnKey | '') {
    if (!mapping || !selectedCompany) return

    const newDetected = { ...mapping.detected }
    const newUnmapped = [...mapping.unmappedHeaders]

    // Remove current assignment of this header (if any)
    const oldKey = (
      Object.entries(newDetected).find(([, h]) => h === sourceHeader)?.[0]
    ) as ColumnKey | undefined
    if (oldKey) {
      delete newDetected[oldKey]
    } else {
      const idx = newUnmapped.indexOf(sourceHeader)
      if (idx >= 0) newUnmapped.splice(idx, 1)
    }

    if (newKey) {
      // Displace existing occupant (if any) to unmapped
      const displaced = newDetected[newKey as ColumnKey]
      if (displaced && displaced !== sourceHeader) {
        newUnmapped.push(displaced)
      }
      newDetected[newKey as ColumnKey] = sourceHeader
    } else {
      // Explicit unassign — header goes back to unmapped
      newUnmapped.push(sourceHeader)
    }

    const REQUIRED: ColumnKey[] = ['firstName', 'lastName']
    const missingColumns = REQUIRED.filter((c) => !newDetected[c])
    const newMapping: ColumnMapping = {
      detected: newDetected,
      unmappedHeaders: newUnmapped,
      missingColumns,
    }

    setMapping(newMapping)

    // Clear AI confidence badge for manually overridden slots
    if (oldKey || newKey) {
      setAiConfidence((prev) => {
        const updated = { ...prev }
        if (oldKey) delete updated[oldKey]
        if (newKey) delete updated[newKey as ColumnKey]
        return updated
      })
    }

    // Re-annotate rows and refresh diff
    if (rawRows.length > 0) {
      const remapped = reapplyMapping(rawRows, newMapping)
      const reAnnotated = annotateRows(remapped, selectedCompany)
      setRows(reAnnotated)
      runDiff(companyId, reAnnotated)
    }
  }

  async function handleCommit() {
    if (!companyId || rows.length === 0) {
      setError(labels.errorNoValidRows)
      return
    }
    const validRows = rows.filter(
      (r) => r.issues.length === 0 && r.firstName && r.lastName
    )
    if (validRows.length === 0) {
      setError(labels.errorNoValidRows)
      return
    }

    setError(null)
    setPhase('committing')

    try {
      const response = await fetch('/api/employees/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          rows: validRows.map((r) => ({
            rowNumber: r.rowNumber,
            firstName: r.firstName!,
            lastName: r.lastName!,
            companyEmployeeId: r.companyEmployeeId,
            email: r.email,
            department: r.department,
            skipIfDuplicate: skipDuplicates,
          })),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.message || data.error || labels.errorCommit)
        setPhase('previewing')
        return
      }
      setCommitResult(data)
      TOAST.importSuccess(data.summary?.created ?? 0)
      setPhase('done')
    } catch (err) {
      console.error('Commit error', err)
      setError(labels.errorCommit)
      setPhase('previewing')
    }
  }

  function reset() {
    aiGenRef.current++ // invalidate any in-flight AI calls
    setPhase('idle')
    setRows([])
    setRawRows([])
    setFileHeaders([])
    setMapping(null)
    setParseErrors([])
    setError(null)
    setCommitResult(null)
    setDiffResult(null)
    setDiffLoading(false)
    setAiMappingLoading(false)
    setAiMappingFailed(false)
    setAiUsed(false)
    setAiConfidence({})
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── Results screen ─────────────────────────────────────────────
  if (phase === 'done' && commitResult) {
    return (
      <div className="space-y-6">
        <div className="border rounded-lg p-6 bg-card">
          <h2 className="text-xl font-semibold">{labels.resultSuccess}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {labels.resultSummary
              .replace('{total}', String(commitResult.summary.total))
              .replace('{created}', String(commitResult.summary.created))
              .replace('{skipped}', String(commitResult.summary.skipped))
              .replace('{failed}', String(commitResult.summary.failed))}
          </p>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <StatBox
              label={labels.rowsValid}
              value={commitResult.summary.created}
              tone="success"
            />
            <StatBox
              label={labels.rowsDuplicate}
              value={commitResult.summary.skipped}
            />
            <StatBox
              label={labels.rowsWithIssues}
              value={commitResult.summary.failed}
              tone={
                commitResult.summary.failed > 0 ? 'destructive' : 'default'
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push('/employees')}>
            {labels.backToList}
          </Button>
          <Button variant="outline" onClick={reset}>
            {labels.resetButton}
          </Button>
        </div>
      </div>
    )
  }

  // ─── Setup + preview ────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Step 1: pick company */}
      <div className="space-y-2">
        <Label htmlFor="company">{labels.companyLabel}</Label>
        <select
          id="company"
          value={companyId}
          onChange={(e) => {
            setCompanyId(e.target.value)
            setRows([])
            setMapping(null)
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          disabled={phase === 'committing'}
        >
          <option value="">{labels.companyPlaceholder}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.workplaces.length} {labels.colDepartment.toLowerCase()})
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{labels.companyHelp}</p>
      </div>

      {/* Step 2: upload file */}
      {companyId && (
        <div className="space-y-2">
          <Label htmlFor="file">{labels.fileLabel}</Label>
          <Input
            id="file"
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFileSelect(f)
            }}
            disabled={phase === 'committing'}
          />
          <p className="text-xs text-muted-foreground">{labels.fileHelp}</p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              {labels.fileFormatHelp}
            </summary>
            <div className="mt-2 pl-2 border-l-2 border-muted">
              <p>
                {locale === 'ro'
                  ? 'Antetele așteptate (toleranță la sinonime):'
                  : 'Expected headers (synonyms tolerated):'}
              </p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>{labels.colFirstName}: prenume, first name, prenumele</li>
                <li>{labels.colLastName}: nume, last name, surname</li>
                <li>{labels.colEmployeeId}: id angajat, marca, matricola, employee id</li>
                <li>{labels.colEmail}: email, e-mail, mail</li>
                <li>{labels.colDepartment}: departament, sectie, post, workplace</li>
              </ul>
              <p className="mt-2">
                <a
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                    '﻿prenume,nume,id angajat,email,departament\r\n' +
                      'Andreea,Popescu,1001,andreea@example.com,Sudor\r\n' +
                      'Mihai,Ionescu,1002,mihai@example.com,Birou\r\n'
                  )}`}
                  download="template_angajati.csv"
                  className="text-primary hover:underline"
                >
                  {labels.downloadTemplate}
                </a>
              </p>
            </div>
          </details>
        </div>
      )}

      {/* Errors */}
      {error && (
        <div className="border border-destructive text-destructive bg-destructive/5 rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 text-amber-900 rounded-md p-3 text-sm space-y-1">
          {parseErrors.slice(0, 5).map((err, i) => (
            <div key={i}>{err}</div>
          ))}
          {parseErrors.length > 5 && (
            <div className="italic">
              ... and {parseErrors.length - 5} more
            </div>
          )}
        </div>
      )}

      {/* Column mapping panel */}
      {mapping && (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
          {/* AI status indicators */}
          {aiMappingLoading && (
            <div className="flex items-center gap-2 text-xs text-violet-600">
              <span className="inline-block w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              {labels.mappingAiLoading}
            </div>
          )}
          {aiMappingFailed && !aiMappingLoading && (
            <div className="text-xs text-amber-700">
              ⚠ {labels.mappingAiTimeout}
            </div>
          )}
          {aiUsed && !aiMappingLoading && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 uppercase tracking-wide">
                AI
              </span>
              <p className="text-xs text-violet-600">{labels.mappingAiNote}</p>
            </div>
          )}

          {/* All headers with override dropdowns */}
          {fileHeaders.length > 0 && (
            <div>
              <span className="text-sm font-medium">{labels.mappingDetected}:</span>
              <div className="mt-2 space-y-2">
                {fileHeaders.map((header) => {
                  const currentKey = headerToCurrentKey(header, mapping)
                  const conf = currentKey ? aiConfidence[currentKey] : undefined
                  const isAiMapped = aiUsed && conf !== undefined
                  const isLowConf = isAiMapped && conf === 'low'
                  return (
                    <div
                      key={header}
                      className={`flex items-center gap-2 flex-wrap text-sm${isLowConf ? ' rounded bg-amber-50 px-2 py-0.5' : ''}`}
                    >
                      <code className="text-xs bg-background border px-1.5 py-0.5 rounded whitespace-nowrap">
                        {header}
                      </code>
                      <span className="text-muted-foreground text-xs">→</span>
                      <select
                        value={currentKey ?? ''}
                        onChange={(e) =>
                          handleMappingOverride(
                            header,
                            e.target.value as ColumnKey | ''
                          )
                        }
                        className="h-7 rounded border border-input bg-background px-2 text-xs"
                      >
                        <option value="">—</option>
                        {COLUMN_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {colKeyLabel(k, labels)}
                          </option>
                        ))}
                      </select>
                      {isAiMapped && (
                        <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-violet-100 text-violet-700 uppercase tracking-wide">
                          AI
                        </span>
                      )}
                      {isLowConf && (
                        <span className="text-[10px] text-amber-700">
                          {labels.mappingLowConfidence}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Missing required columns */}
          {mapping.missingColumns.length > 0 && (
            <div className="text-destructive text-sm">
              <span className="font-medium">{labels.mappingMissing}:</span>{' '}
              {mapping.missingColumns.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <>
          <PreviewSummary
            rows={rows}
            workplaces={selectedCompany?.workplaces ?? []}
            labels={labels}
          />

          {diffLoading && (
            <div className="text-xs text-muted-foreground animate-pulse px-1">
              {labels.diffLoading}
            </div>
          )}
          {diffResult && (
            <RosterDiffPanel result={diffResult} labels={labels} />
          )}

          <div className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id="skip-duplicates"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
              disabled={phase === 'committing'}
            />
            <Label htmlFor="skip-duplicates" className="font-normal">
              {skipDuplicates
                ? labels.skipDuplicates
                : labels.importAnywayDuplicates}
            </Label>
          </div>

          <PreviewTable rows={rows} labels={labels} />

          <div className="flex flex-wrap gap-2 sticky bottom-4 bg-background/95 backdrop-blur border rounded-lg p-3">
            <Button
              onClick={handleCommit}
              disabled={
                phase === 'committing' ||
                rows.filter((r) => r.issues.length === 0).length === 0
              }
            >
              {phase === 'committing'
                ? labels.committing
                : `${labels.commitButton} (${rows.filter((r) => r.issues.length === 0).length})`}
            </Button>
            <Button
              variant="outline"
              onClick={reset}
              disabled={phase === 'committing'}
            >
              {labels.resetButton}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function PreviewSummary({
  rows,
  workplaces,
  labels,
}: {
  rows: AnnotatedRow[]
  workplaces: Array<{ id: string; name: string; department: string | null }>
  labels: Record<string, string>
}) {
  const valid = rows.filter((r) => r.issues.length === 0).length
  const withIssues = rows.length - valid

  const byWorkplace = new Map<string, number>()
  let unassigned = 0
  for (const row of rows) {
    if (row.issues.length > 0) continue
    if (row.workplaceId) {
      const wp = workplaces.find((w) => w.id === row.workplaceId)
      const name = wp?.name ?? row.department ?? '?'
      byWorkplace.set(name, (byWorkplace.get(name) ?? 0) + 1)
    } else {
      unassigned++
    }
  }
  const hasBreakdown = byWorkplace.size > 0 || unassigned > 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatBox label={labels.rowsTotal} value={rows.length} />
        <StatBox label={labels.rowsValid} value={valid} tone="success" />
        <StatBox
          label={labels.rowsWithIssues}
          value={withIssues}
          tone={withIssues > 0 ? 'destructive' : 'default'}
        />
      </div>
      {hasBreakdown && (
        <div className="border rounded-lg p-3 text-xs space-y-1">
          <div className="font-medium text-muted-foreground uppercase tracking-wide text-xs mb-2">
            {labels.workplaceBreakdown}
          </div>
          {Array.from(byWorkplace.entries()).map(([name, count]) => (
            <div key={name} className="flex justify-between">
              <span className="text-foreground">{name}</span>
              <span className="text-muted-foreground tabular-nums">{count}</span>
            </div>
          ))}
          {unassigned > 0 && (
            <div className="flex justify-between text-amber-700">
              <span>{labels.workplaceUnassigned}</span>
              <span className="tabular-nums">{unassigned}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatBox({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'success' | 'destructive'
}) {
  const toneClass =
    tone === 'success' && value > 0
      ? 'border-green-200 bg-green-50'
      : tone === 'destructive' && value > 0
        ? 'border-destructive bg-destructive/5'
        : ''
  const valueClass =
    tone === 'success' && value > 0
      ? 'text-green-700'
      : tone === 'destructive' && value > 0
        ? 'text-destructive'
        : ''
  return (
    <div className={`border rounded-lg p-3 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</div>
    </div>
  )
}

function PreviewTable({
  rows,
  labels,
}: {
  rows: AnnotatedRow[]
  labels: Record<string, string>
}) {
  return (
    <div className="border rounded-lg overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-sm min-w-[700px]">
        <thead className="bg-muted/30 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-3 py-2">{labels.colRow}</th>
            <th className="text-left px-3 py-2">{labels.colStatus}</th>
            <th className="text-left px-3 py-2">{labels.colFirstName}</th>
            <th className="text-left px-3 py-2">{labels.colLastName}</th>
            <th className="text-left px-3 py-2">{labels.colEmployeeId}</th>
            <th className="text-left px-3 py-2">{labels.colEmail}</th>
            <th className="text-left px-3 py-2">{labels.colDepartment}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const hasIssues = r.issues.length > 0
            const hasWarnings = r.warnings.length > 0
            const rowClass = hasIssues
              ? 'bg-destructive/5'
              : hasWarnings
                ? 'bg-amber-50'
                : ''
            return (
              <tr key={r.rowNumber} className={rowClass}>
                <td className="px-3 py-2 text-muted-foreground text-xs font-mono">
                  {r.rowNumber}
                </td>
                <td className="px-3 py-2">
                  {hasIssues ? (
                    <div className="space-y-1">
                      <span className="text-xs text-destructive font-medium">
                        {labels.statusIssue}
                      </span>
                      {r.issues.map((issue) => (
                        <div
                          key={issue}
                          className="text-xs text-destructive"
                        >
                          {issueLabel(issue, labels)}
                        </div>
                      ))}
                    </div>
                  ) : hasWarnings ? (
                    <div className="space-y-1">
                      <span className="text-xs text-amber-700 font-medium">
                        {labels.statusWarning}
                      </span>
                      {r.warnings.map((w) => (
                        <div key={w} className="text-xs text-amber-700">
                          {warningLabel(w, labels)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-green-700 font-medium">
                      {labels.statusOk}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.firstName || (
                    <span className="text-destructive">—</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.lastName || <span className="text-destructive">—</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.companyEmployeeId ?? '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.email ?? '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.department ?? '—'}
                  {r.department && !r.workplaceMatched && (
                    <span className="text-destructive text-xs ml-1">
                      (?)
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RosterDiffPanel({
  result,
  labels,
}: {
  result: DiffResult
  labels: Record<string, string>
}) {
  if (result.currentCount === 0) {
    return (
      <div className="border border-green-200 bg-green-50 rounded-lg p-4 text-sm text-green-800">
        <strong>{labels.diffFirstImport}</strong>{' '}
        {labels.diffFirstImportDesc.replace('{count}', String(result.new.length))}
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="text-sm font-medium">{labels.diffTitle}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label={labels.diffNew} value={result.new.length} tone="success" />
        <StatBox
          label={labels.diffLeaving}
          value={result.leaving.length}
          tone={result.leaving.length > 0 ? 'destructive' : 'default'}
        />
        <StatBox label={labels.diffMoved} value={result.moved.length} />
        <StatBox label={labels.diffUnchanged} value={result.unchanged} />
      </div>
      {result.leaving.length > 0 && (
        <p className="text-xs text-muted-foreground">{labels.diffLeavingNote}</p>
      )}
      {result.leaving.length > 0 && (
        <details>
          <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
            {labels.diffShowLeaving} ({result.leaving.length})
          </summary>
          <ul className="mt-2 text-xs space-y-0.5 pl-2 border-l-2 border-muted">
            {result.leaving.slice(0, 20).map((e) => (
              <li key={e.id} className="text-muted-foreground">
                {e.firstName} {e.lastName}
                {e.workplace ? ` — ${e.workplace}` : ''}
              </li>
            ))}
            {result.leaving.length > 20 && (
              <li className="italic text-muted-foreground">
                … +{result.leaving.length - 20}
              </li>
            )}
          </ul>
        </details>
      )}
      {result.moved.length > 0 && (
        <details>
          <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
            {labels.diffShowMoved} ({result.moved.length})
          </summary>
          <ul className="mt-2 text-xs space-y-0.5 pl-2 border-l-2 border-muted">
            {result.moved.slice(0, 20).map((e, i) => (
              <li key={i} className="text-muted-foreground">
                {e.firstName} {e.lastName}: {e.fromWorkplace} → {e.toWorkplace}
              </li>
            ))}
            {result.moved.length > 20 && (
              <li className="italic text-muted-foreground">
                … +{result.moved.length - 20}
              </li>
            )}
          </ul>
        </details>
      )}
    </div>
  )
}

function issueLabel(code: string, labels: Record<string, string>): string {
  switch (code) {
    case 'missing_first_name':
      return labels.issueMissingFirstName
    case 'missing_last_name':
      return labels.issueMissingLastName
    case 'invalid_email':
      return labels.issueInvalidEmail
    case 'workplace_not_found':
      return labels.issueWorkplaceNotFound
    default:
      return code
  }
}

function warningLabel(code: string, labels: Record<string, string>): string {
  switch (code) {
    case 'no_department':
      return labels.warningNoDepartment
    case 'duplicate_within_file_name':
    case 'duplicate_within_file_email':
      return labels.warningDuplicateEmployee
    default:
      return code
  }
}
