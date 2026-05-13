'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  parseImportFile,
  validateRow,
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

type Phase = 'idle' | 'previewing' | 'committing' | 'done'

export function ImportClient({ companies, locale, labels }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [companyId, setCompanyId] = useState<string>(
    companies.length === 1 ? companies[0].id : ''
  )
  const [phase, setPhase] = useState<Phase>('idle')
  const [rows, setRows] = useState<AnnotatedRow[]>([])
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
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

  /**
   * Workplace matcher. Same algorithm as the server, must stay in sync.
   * Matches by department field (case-insensitive) or by workplace
   * name (case-insensitive).
   */
  function matchWorkplace(
    company: Company,
    dept: string | null
  ): Workplace | null {
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

  async function handleFileSelect(file: File) {
    if (!companyId || !selectedCompany) {
      setError(labels.errorNoCompany)
      return
    }
    setError(null)
    setParseErrors([])
    setPhase('previewing')

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

      // Annotate rows with validation + workplace + duplicate info.
      // Duplicate-within-file detection: build a set of seen names as
      // we go and mark second occurrences.
      const seenNames = new Set<string>()
      const seenEmails = new Set<string>()
      const annotated: AnnotatedRow[] = result.rows.map((row) => {
        const v = validateRow(row)
        const wp = matchWorkplace(selectedCompany, row.department)
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
          duplicateNameMatch: false, // DB-side dup; preview doesn't check this
          duplicateEmailMatch: false,
          workplaceMatched: !!wp,
          workplaceId: wp?.id ?? null,
        }
      })
      setRows(annotated)
    } catch (err) {
      console.error('Parse error', err)
      setError(labels.errorParse)
      setPhase('idle')
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
      setPhase('done')
    } catch (err) {
      console.error('Commit error', err)
      setError(labels.errorCommit)
      setPhase('previewing')
    }
  }

  function reset() {
    setPhase('idle')
    setRows([])
    setMapping(null)
    setParseErrors([])
    setError(null)
    setCommitResult(null)
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
                    '\uFEFFprenume,nume,id angajat,email,departament\r\n' +
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

      {/* Column mapping summary */}
      {mapping && (
        <div className="text-sm space-y-2 border rounded-lg p-4 bg-muted/30">
          <div>
            <span className="font-medium">{labels.mappingDetected}:</span>{' '}
            {Object.entries(mapping.detected).length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              Object.entries(mapping.detected).map(
                ([col, header], idx, arr) => (
                  <span key={col}>
                    <code className="text-xs bg-background px-1 rounded">
                      {header}
                    </code>{' '}
                    → <strong>{col}</strong>
                    {idx < arr.length - 1 && ', '}
                  </span>
                )
              )
            )}
          </div>
          {mapping.missingColumns.length > 0 && (
            <div className="text-destructive">
              <span className="font-medium">{labels.mappingMissing}:</span>{' '}
              {mapping.missingColumns.join(', ')}
            </div>
          )}
          {mapping.unmappedHeaders.length > 0 && (
            <div className="text-muted-foreground text-xs">
              {labels.mappingUnmapped}: {mapping.unmappedHeaders.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <>
          <PreviewSummary rows={rows} labels={labels} />

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
  labels,
}: {
  rows: AnnotatedRow[]
  labels: Record<string, string>
}) {
  const valid = rows.filter((r) => r.issues.length === 0).length
  const withIssues = rows.length - valid
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <StatBox label={labels.rowsTotal} value={rows.length} />
      <StatBox label={labels.rowsValid} value={valid} tone="success" />
      <StatBox
        label={labels.rowsWithIssues}
        value={withIssues}
        tone={withIssues > 0 ? 'destructive' : 'default'}
      />
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
