'use client'

import { useRouter } from 'next/navigation'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { maskCnp, validateCnp } from '@/lib/crypto/cnp-validation'
import {
  combineDateParts,
  normalizeCnpInput,
  normalizeWorkplaceValue,
  workplaceKey,
} from '@/lib/employees/import-normalize'
import {
  ASSIGNABLE_COLUMN_KEYS,
  aiEnhancedColumnMapping,
  type ColumnKey,
  type ColumnMapping,
  parseImportFile,
  type RawRow,
  validateRow,
} from '@/lib/employees/import-parser'
import { TOAST } from '@/lib/toast'

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

type WorkplaceStatus = 'existing' | 'willCreate' | 'none'

interface AnnotatedRow extends RawRow {
  issues: string[]
  warnings: string[]
  workplaceMatched: boolean
  workplaceId: string | null
  workplaceStatus: WorkplaceStatus
  newWorkplaceName: string | null
}

interface DiffResult {
  currentCount: number
  new: Array<{ rowNumber: number; firstName: string; lastName: string; toWorkplace: string | null }>
  leaving: Array<{ id: string; firstName: string; lastName: string; workplace: string }>
  moved: Array<{
    rowNumber: number
    firstName: string
    lastName: string
    fromWorkplace: string
    toWorkplace: string
  }>
  unchanged: number
}

interface CommitSummary {
  total: number
  created: number
  updated: number
  skipped: number
  failed: number
  companiesCreated: number
  workplacesCreated: number
  rowsWithoutCompany: number
  rowsWithoutWorkplace: number
  cnpSaved: number
  cnpInvalid: number
  recallsCreated: number
}

interface CommitResult {
  summary: CommitSummary
  notices: string[]
  companiesCreated: Array<{ id: string; name: string; cui: string }>
  workplacesCreated: string[]
}

// Shape of one /commit batch response. Typed explicitly so threading the
// ImportJob id back into the next batch's request body doesn't create a
// circular `any` inference.
interface CommitResponse {
  importJobId?: string
  summary: CommitSummary
  notices?: string[]
  companiesCreated?: Array<{ id: string; name: string; cui: string }>
  workplacesCreated?: string[]
  message?: string
  error?: string
}

type Phase = 'idle' | 'previewing' | 'committing' | 'done'

interface StagedFile {
  id: string
  originalFilename: string
  uploadedAt: string
  uploadedByName: string
}

// The server caps each request at 500 rows; we split large rosters into
// sequential batches comfortably below that so each POST stays well within
// Vercel's execution window (spec §6 — the APAPROD file has ~613 rows).
const COMMIT_BATCH_SIZE = 200

const COLUMN_KEYS: ColumnKey[] = ASSIGNABLE_COLUMN_KEYS

function colKeyLabel(key: ColumnKey, labels: Record<string, string>): string {
  switch (key) {
    case 'firstName':
      return labels.colFirstName
    case 'lastName':
      return labels.colLastName
    case 'cnp':
      return labels.colCnp ?? 'CNP'
    case 'companyEmployeeId':
      return labels.colEmployeeId
    case 'email':
      return labels.colEmail
    case 'department':
      return labels.colDepartment
    case 'jobTitle':
      return labels.colJobTitle ?? 'Funcție'
    case 'city':
      return labels.colCity ?? 'Oraș'
    case 'companyName':
      return 'Nume companie'
    case 'cui':
      return 'CUI'
    case 'companyAddress':
      return 'Adresă companie'
    case 'workplaceName':
      return labels.colWorkplace ?? 'Loc de muncă'
    case 'workSiteName':
      return labels.colWorkSite ?? 'Punct de lucru'
    case 'hireDate':
      return labels.colHireDate ?? 'Data angajării'
    case 'fitnessValidUntil':
      return labels.colFitnessValidUntil ?? 'Expirare fișă aptitudine'
    case 'fitnessValidUntilDay':
      return labels.colFitnessExpDay ?? 'Zi expirare fișă'
    case 'fitnessValidUntilMonth':
      return labels.colFitnessExpMonth ?? 'Lună expirare fișă'
    case 'fitnessValidUntilYear':
      return labels.colFitnessExpYear ?? 'An expirare fișă'
    case 'notes':
      return labels.colNotes ?? 'Mențiuni'
  }
}

function matchWorkplace(company: Company, label: string | null): Workplace | null {
  if (!label) return null
  const key = workplaceKey(label)
  for (const w of company.workplaces) {
    if (w.department && workplaceKey(w.department) === key) return w
  }
  for (const w of company.workplaces) {
    if (workplaceKey(w.name) === key) return w
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
    const cnpRaw = get('cnp')
    return {
      ...row,
      firstName: get('firstName'),
      lastName: get('lastName'),
      cnp: cnpRaw ? normalizeCnpInput(cnpRaw) : null,
      companyEmployeeId: get('companyEmployeeId'),
      email: get('email'),
      department: get('department'),
      jobTitle: get('jobTitle'),
      city: get('city'),
      companyName: get('companyName'),
      cui: get('cui'),
      companyAddress: get('companyAddress'),
      workplaceName: get('workplaceName'),
      workSiteName: get('workSiteName'),
      hireDate: get('hireDate'),
      fitnessValidUntil:
        get('fitnessValidUntil') ??
        combineDateParts(
          get('fitnessValidUntilDay'),
          get('fitnessValidUntilMonth'),
          get('fitnessValidUntilYear')
        ),
      notes: get('notes'),
    }
  })
}

/**
 * Annotates rows with validation + workplace status. One rule set, no mode
 * branching: a workplace/department value either matches an existing
 * workplace (existing), will be created at import (willCreate), or is
 * absent (none). The server applies the identical rule (import spec §5).
 */
function annotateRows(remappedRows: RawRow[], company: Company | null | undefined): AnnotatedRow[] {
  const seenNames = new Set<string>()
  const seenEmails = new Set<string>()
  const seenCnp = new Set<string>()
  return remappedRows.map((row) => {
    const v = validateRow(row)
    const issues = [...v.issues]
    const warnings = [...v.warnings]

    const label = row.workplaceName ?? row.department
    const wp = company ? matchWorkplace(company, label) : null
    let workplaceStatus: WorkplaceStatus
    if (!label) workplaceStatus = 'none'
    else if (wp) workplaceStatus = 'existing'
    else workplaceStatus = 'willCreate'

    // Company-column completeness: only a problem when there is genuinely no
    // company to attach to. A CUI with no name and no selected company can't
    // create a company. A name without CUI may still match an existing
    // company server-side, so it is not flagged here (spec §5).
    if (!company && row.cui && !row.companyName) {
      warnings.push('incomplete_company_columns')
    }
    // Workplace value but nothing to attach it to.
    if (label && !row.cui && !row.companyName && !company) {
      warnings.push('workplace_without_company')
    }

    const nameKey = `${row.firstName?.toLowerCase()}|${row.lastName?.toLowerCase()}`
    const emailKey = row.email?.toLowerCase() ?? null
    const cnpKey = row.cnp && validateCnp(row.cnp).valid ? row.cnp : null
    if (cnpKey && seenCnp.has(cnpKey)) warnings.push('duplicate_within_file_cnp')
    else if (seenNames.has(nameKey)) warnings.push('duplicate_within_file_name')
    else if (emailKey && seenEmails.has(emailKey)) warnings.push('duplicate_within_file_email')
    if (row.firstName && row.lastName) seenNames.add(nameKey)
    if (emailKey) seenEmails.add(emailKey)
    if (cnpKey) seenCnp.add(cnpKey)

    return {
      ...row,
      issues,
      warnings,
      workplaceMatched: !!wp,
      workplaceId: wp?.id ?? null,
      workplaceStatus,
      newWorkplaceName:
        workplaceStatus === 'willCreate' && label ? normalizeWorkplaceValue(label) : null,
    }
  })
}

export function ImportClient({ companies, locale, labels }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const aiGenRef = useRef(0)

  const [companyId, setCompanyId] = useState<string>(companies.length === 1 ? companies[0].id : '')
  const [phase, setPhase] = useState<Phase>('idle')
  const [rows, setRows] = useState<AnnotatedRow[]>([])
  const [rawRows, setRawRows] = useState<RawRow[]>([])
  const [fileHeaders, setFileHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [sheetNotes, setSheetNotes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  // Opt-in: overwrite existing employees with the file's data instead of
  // skipping them (prompt-import-update.md). Default off so other users'
  // imports keep today's skip behaviour.
  const [updateExisting, setUpdateExisting] = useState(false)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [aiMappingLoading, setAiMappingLoading] = useState(false)
  const [aiMappingFailed, setAiMappingFailed] = useState(false)
  const [aiUsed, setAiUsed] = useState(false)
  const [aiConfidence, setAiConfidence] = useState<
    Partial<Record<ColumnKey, 'high' | 'medium' | 'low'>>
  >({})
  const [extendedMode, setExtendedMode] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [commitProgress, setCommitProgress] = useState<{ done: number; total: number } | null>(null)
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)
  const [resultJobId, setResultJobId] = useState<string | null>(null)

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [stagedFilesLoading, setStagedFilesLoading] = useState(false)
  const [stagingFile, setStagingFile] = useState(false)
  const [activeStagedFileId, setActiveStagedFileId] = useState<string | null>(null)
  const stageInputRef = useRef<HTMLInputElement>(null)

  const selectedCompany = companies.find((c) => c.id === companyId)

  const loadStagedFiles = useCallback(() => {
    setStagedFilesLoading(true)
    fetch('/api/employees/import/staged')
      .then((res) => (res.ok ? res.json() : { files: [] }))
      .then((data: { files: StagedFile[] }) => setStagedFiles(data.files))
      .catch(() => {})
      .finally(() => setStagedFilesLoading(false))
  }, [])

  useEffect(() => {
    loadStagedFiles()
  }, [loadStagedFiles])

  async function handleStageUpload(file: File) {
    setStagingFile(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/employees/import/stage', { method: 'POST', body: fd })
      if (res.ok) {
        const data: StagedFile = await res.json()
        setStagedFiles((prev) => [data, ...prev])
        TOAST.saved()
      } else {
        const err = await res.json().catch(() => ({}))
        setError(
          err.error === 'file_too_large' ? 'Fișierul depășește 10 MB.' : 'Încărcarea a eșuat.'
        )
      }
    } catch {
      setError('Eroare de rețea la încărcare.')
    } finally {
      setStagingFile(false)
      if (stageInputRef.current) stageInputRef.current.value = ''
    }
  }

  async function handleProcessStaged(stagedFile: StagedFile) {
    setError(null)
    try {
      const res = await fetch(`/api/employees/import/staged/${stagedFile.id}/download`)
      if (!res.ok) {
        setError('Nu s-a putut genera link-ul de descărcare.')
        return
      }
      const { signedUrl, filename } = (await res.json()) as { signedUrl: string; filename: string }

      const fileRes = await fetch(signedUrl)
      if (!fileRes.ok) {
        setError('Descărcarea fișierului a eșuat.')
        return
      }
      const blob = await fileRes.blob()
      const mimeType = filename.toLowerCase().endsWith('.csv')
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const file = new File([blob], filename, { type: mimeType })
      setActiveStagedFileId(stagedFile.id)
      await handleFileSelect(file)
    } catch {
      setError('Eroare la procesarea fișierului staged.')
    }
  }

  async function handleDeleteStaged(id: string) {
    const res = await fetch(`/api/employees/import/staged/${id}`, { method: 'DELETE' })
    if (res.ok) setStagedFiles((prev) => prev.filter((f) => f.id !== id))
  }

  function runDiff(cid: string, annotated: AnnotatedRow[]) {
    const validForDiff = annotated.filter((r) => r.issues.length === 0 && r.firstName && r.lastName)
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
          workplaceName: r.workplaceName,
          workSiteName: r.workSiteName,
          cnp: r.cnp,
        })),
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DiffResult | null) => {
        if (data) setDiffResult(data)
      })
      .catch(() => {})
      .finally(() => setDiffLoading(false))
  }

  async function handleFileSelect(file: File) {
    setError(null)
    setParseErrors([])
    setSheetNotes([])
    setFileName(file.name)
    setPhase('previewing')
    setAiUsed(false)
    setAiConfidence({})
    setAiMappingFailed(false)
    aiGenRef.current++
    const myGen = aiGenRef.current

    try {
      let result: Awaited<ReturnType<typeof parseImportFile>>
      const isExcel =
        file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
      if (isExcel) {
        const buffer = await file.arrayBuffer()
        result = await parseImportFile({ buffer, filename: file.name })
      } else {
        const text = await file.text()
        result = await parseImportFile({ text })
      }

      const isExtended = !!(result.mapping.detected.companyName || result.mapping.detected.cui)
      setExtendedMode(isExtended)

      // Old mode still requires a company to be selected.
      if (!isExtended && (!companyId || !selectedCompany)) {
        setError(labels.errorNoCompany)
        setPhase('idle')
        return
      }

      const company = selectedCompany ?? null

      setMapping(result.mapping)
      setParseErrors(result.parseErrors)
      setSheetNotes(result.sheetNotes)
      setRawRows(result.rows)

      const headers =
        result.rows.length > 0
          ? Object.keys(result.rows[0].raw)
          : [...Object.values(result.mapping.detected), ...result.mapping.unmappedHeaders]
      setFileHeaders(headers)

      const annotated = annotateRows(result.rows, company)
      setRows(annotated)
      if (!isExtended) runDiff(companyId, annotated)

      if (result.mapping.missingColumns.length >= 2) {
        setAiMappingLoading(true)
        aiEnhancedColumnMapping(headers, result.mapping)
          .then((aiResult) => {
            if (aiGenRef.current !== myGen) return
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
            if (!isExtended) runDiff(companyId, reAnnotated)
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
    if (!mapping) return

    const newDetected = { ...mapping.detected }
    const newUnmapped = [...mapping.unmappedHeaders]

    const oldKey = Object.entries(newDetected).find(([, h]) => h === sourceHeader)?.[0] as
      | ColumnKey
      | undefined
    if (oldKey) {
      delete newDetected[oldKey]
    } else {
      const idx = newUnmapped.indexOf(sourceHeader)
      if (idx >= 0) newUnmapped.splice(idx, 1)
    }

    if (newKey) {
      const displaced = newDetected[newKey as ColumnKey]
      if (displaced && displaced !== sourceHeader) {
        newUnmapped.push(displaced)
      }
      newDetected[newKey as ColumnKey] = sourceHeader
    } else {
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

    if (oldKey || newKey) {
      setAiConfidence((prev) => {
        const updated = { ...prev }
        if (oldKey) delete updated[oldKey]
        if (newKey) delete updated[newKey as ColumnKey]
        return updated
      })
    }

    if (rawRows.length > 0) {
      const remapped = reapplyMapping(rawRows, newMapping)
      const reAnnotated = annotateRows(remapped, selectedCompany)
      setRows(reAnnotated)
      if (!extendedMode) runDiff(companyId, reAnnotated)
    }
  }

  async function handleCommit() {
    if (rows.length === 0) {
      setError(labels.errorNoValidRows)
      return
    }
    if (!extendedMode && !companyId) {
      setError(labels.errorNoCompany)
      return
    }
    const validRows = rows.filter(
      (r): r is AnnotatedRow & { firstName: string; lastName: string } =>
        r.issues.length === 0 && !!r.firstName && !!r.lastName
    )
    if (validRows.length === 0) {
      setError(labels.errorNoValidRows)
      return
    }

    setError(null)
    setPhase('committing')

    // Split into sequential batches of ≤ COMMIT_BATCH_SIZE so a 600-row
    // roster doesn't blow the server's 500-row cap or Vercel's timeout.
    const batches: AnnotatedRow[][] = []
    for (let i = 0; i < validRows.length; i += COMMIT_BATCH_SIZE) {
      batches.push(validRows.slice(i, i + COMMIT_BATCH_SIZE))
    }

    const acc: CommitSummary = {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      companiesCreated: 0,
      workplacesCreated: 0,
      rowsWithoutCompany: 0,
      rowsWithoutWorkplace: 0,
      cnpSaved: 0,
      cnpInvalid: 0,
      recallsCreated: 0,
    }
    const newCompanies = new Map<string, { id: string; name: string; cui: string }>()
    const newWorkplaces = new Set<string>()
    const notices = new Set<string>()

    setCommitProgress({ done: 0, total: validRows.length })

    // One ImportJob spans every batch: the first batch creates it and hands
    // the id back, later batches reuse it (spec §8).
    let jobId: string | null = null

    try {
      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b]
        const isLast = b === batches.length - 1
        const response = await fetch('/api/employees/import/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: companyId || null,
            // Mark the staged file processed only once, on the final batch.
            stagedFileId: isLast ? activeStagedFileId : null,
            importJobId: jobId,
            importTotal: validRows.length,
            fileName,
            isFinalBatch: isLast,
            rows: batch.map((r) => ({
              rowNumber: r.rowNumber,
              firstName: r.firstName,
              lastName: r.lastName,
              cnp: r.cnp,
              companyEmployeeId: r.companyEmployeeId,
              email: r.email,
              department: r.department,
              jobTitle: r.jobTitle,
              city: r.city,
              notes: r.notes,
              hireDate: r.hireDate,
              fitnessValidUntil: r.fitnessValidUntil,
              skipIfDuplicate: skipDuplicates,
              updateExisting,
              companyName: r.companyName ?? null,
              cui: r.cui ?? null,
              companyAddress: r.companyAddress ?? null,
              workplaceName: r.workplaceName ?? null,
              workSiteName: r.workSiteName ?? null,
            })),
          }),
        })
        const data = (await response.json()) as CommitResponse
        if (!response.ok) {
          setError(data.message || data.error || labels.errorCommit)
          setPhase('previewing')
          setCommitProgress(null)
          return
        }

        if (typeof data.importJobId === 'string') jobId = data.importJobId

        const s: CommitSummary = data.summary
        acc.total += s.total
        acc.created += s.created
        acc.updated += s.updated ?? 0
        acc.skipped += s.skipped
        acc.failed += s.failed
        acc.companiesCreated += s.companiesCreated
        acc.workplacesCreated += s.workplacesCreated
        acc.rowsWithoutCompany += s.rowsWithoutCompany
        acc.rowsWithoutWorkplace += s.rowsWithoutWorkplace
        acc.cnpSaved += s.cnpSaved ?? 0
        acc.cnpInvalid += s.cnpInvalid ?? 0
        acc.recallsCreated += s.recallsCreated ?? 0
        for (const c of (data.companiesCreated ?? []) as Array<{
          id: string
          name: string
          cui: string
        }>) {
          newCompanies.set(c.cui, c)
        }
        for (const w of (data.workplacesCreated ?? []) as string[]) newWorkplaces.add(w)
        for (const n of (data.notices ?? []) as string[]) notices.add(n)

        setCommitProgress({
          done: Math.min(validRows.length, (b + 1) * COMMIT_BATCH_SIZE),
          total: validRows.length,
        })
      }

      setCommitResult({
        summary: acc,
        notices: Array.from(notices),
        companiesCreated: Array.from(newCompanies.values()),
        workplacesCreated: Array.from(newWorkplaces),
      })
      setResultJobId(jobId)
      TOAST.importSuccess(acc.created)
      if (activeStagedFileId) {
        setStagedFiles((prev) => prev.filter((f) => f.id !== activeStagedFileId))
        setActiveStagedFileId(null)
      }
      setCommitProgress(null)
      setPhase('done')
    } catch (err) {
      console.error('Commit error', err)
      setError(labels.errorCommit)
      setPhase('previewing')
      setCommitProgress(null)
    }
  }

  function reset() {
    aiGenRef.current++
    setPhase('idle')
    setExtendedMode(false)
    setRows([])
    setRawRows([])
    setFileHeaders([])
    setMapping(null)
    setParseErrors([])
    setSheetNotes([])
    setError(null)
    setCommitResult(null)
    setResultJobId(null)
    setFileName(null)
    setCommitProgress(null)
    setDiffResult(null)
    setDiffLoading(false)
    setAiMappingLoading(false)
    setAiMappingFailed(false)
    setAiUsed(false)
    setAiConfidence({})
    if (fileInputRef.current) fileInputRef.current.value = ''
    setActiveStagedFileId(null)
  }

  // ─── Results screen ─────────────────────────────────────────────
  if (phase === 'done' && commitResult) {
    const s = commitResult.summary
    return (
      <div className="space-y-6">
        <div className="border rounded-lg p-6 bg-card">
          <h2 className="text-xl font-semibold">{labels.resultSuccess}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {labels.resultSummary
              .replace('{total}', String(s.total))
              .replace('{created}', String(s.created))
              .replace('{skipped}', String(s.skipped))
              .replace('{failed}', String(s.failed))}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <StatBox label={labels.rowsValid} value={s.created} tone="success" />
            {s.updated > 0 && (
              <StatBox
                label={labels.summaryUpdated ?? 'Actualizați'}
                value={s.updated}
                tone="success"
              />
            )}
            <StatBox label={labels.rowsDuplicate} value={s.skipped} />
            <StatBox
              label={labels.rowsWithIssues}
              value={s.failed}
              tone={s.failed > 0 ? 'destructive' : 'default'}
            />
          </div>

          {/* Entities + medical data produced by the import */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            {s.companiesCreated > 0 && (
              <StatBox
                label={labels.summaryCompaniesCreated ?? 'Companii create'}
                value={s.companiesCreated}
                tone="success"
              />
            )}
            {s.workplacesCreated > 0 && (
              <StatBox
                label={labels.summaryWorkplacesCreated ?? 'Locuri de muncă create'}
                value={s.workplacesCreated}
                tone="success"
              />
            )}
            {s.cnpSaved > 0 && (
              <StatBox
                label={labels.summaryCnpSaved ?? 'CNP-uri salvate'}
                value={s.cnpSaved}
                tone="success"
              />
            )}
            {s.cnpInvalid > 0 && (
              <StatBox
                label={labels.summaryCnpInvalid ?? 'CNP-uri invalide'}
                value={s.cnpInvalid}
                tone="destructive"
              />
            )}
            {s.recallsCreated > 0 && (
              <StatBox
                label={labels.summaryRecallsCreated ?? 'Rechemări create'}
                value={s.recallsCreated}
                tone="success"
              />
            )}
            {s.rowsWithoutWorkplace > 0 && (
              <StatBox
                label={labels.summaryWithoutWorkplace ?? 'Fără loc de muncă'}
                value={s.rowsWithoutWorkplace}
                tone="destructive"
              />
            )}
          </div>

          {commitResult.notices.includes('cnp_encryption_not_configured') && (
            <div className="mt-4 border border-amber-200 bg-amber-50 rounded-md p-3 text-sm text-amber-900">
              {labels.noticeCnpEncryption ??
                'Criptarea CNP nu este configurată pe server — angajații au fost importați fără CNP. Contactează administratorul.'}
            </div>
          )}
          {commitResult.notices.includes('recall_type_missing') && (
            <div className="mt-4 border border-amber-200 bg-amber-50 rounded-md p-3 text-sm text-amber-900">
              {labels.noticeRecallType ??
                'Tipul de examinare „control periodic" lipsește din catalog — scadențele fișelor externe nu au fost înregistrate.'}
            </div>
          )}

          {s.rowsWithoutWorkplace > 0 && (
            <div className="mt-4 border border-amber-200 bg-amber-50 rounded-md p-3 text-sm text-amber-900 space-y-2">
              <p className="font-medium">
                ⚠ {s.rowsWithoutWorkplace}{' '}
                {labels.summaryWithoutWorkplaceNote ?? 'angajați importați fără loc de muncă'}
              </p>
              <p className="text-xs">
                Aceștia nu pot fi programați la examinare până nu li se asignează un loc de muncă.
              </p>
              <a
                href="/employees?wp=no_workplace"
                className="inline-flex items-center gap-1 text-xs font-medium underline hover:text-amber-700"
              >
                → Mergi la lista angajați pentru a asigna în masă
              </a>
            </div>
          )}
          {commitResult.companiesCreated.length > 0 && (
            <div className="mt-4 border border-amber-200 bg-amber-50 rounded-md p-3 text-sm text-amber-900 space-y-2">
              <p className="font-medium">
                Locurile de muncă create automat nu au hazarde asociate. Adaugă profilul de risc din
                pagina companiei.
              </p>
              <ul className="space-y-0.5 pl-1">
                {commitResult.companiesCreated.map((c) => (
                  <li key={c.id}>
                    <a href={`/companies/${c.id}`} className="underline hover:text-amber-700">
                      {c.name} ({c.cui})
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {commitResult.workplacesCreated.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {labels.summaryWorkplacesCreatedList ?? 'Locuri de muncă create'} (
                {commitResult.workplacesCreated.length})
              </summary>
              <ul className="mt-2 pl-2 border-l-2 border-muted space-y-0.5 text-xs text-muted-foreground">
                {commitResult.workplacesCreated.slice(0, 50).map((w) => (
                  <li key={w}>{w}</li>
                ))}
                {commitResult.workplacesCreated.length > 50 && (
                  <li className="italic">… +{commitResult.workplacesCreated.length - 50}</li>
                )}
              </ul>
            </details>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push('/employees')}>{labels.backToList}</Button>
          {resultJobId && (
            <Button
              variant="outline"
              onClick={() => router.push(`/employees/import/history/${resultJobId}`)}
            >
              {labels.viewInHistory ?? 'Vezi în istoric'}
            </Button>
          )}
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
      <div className="flex justify-end">
        <a
          href="/employees/import/history"
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          {labels.importHistoryLink ?? 'Istoric importuri'} →
        </a>
      </div>

      {/* ── Staged files panel ──────────────────────────────────── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
          <div>
            <span className="font-medium text-sm">
              Fișiere încărcate pentru procesare ulterioară
            </span>
            {stagedFiles.length > 0 && (
              <span className="ml-2 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                {stagedFiles.length}
              </span>
            )}
          </div>
          <div>
            <input
              ref={stageInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleStageUpload(f)
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={stagingFile || phase === 'committing'}
              onClick={() => stageInputRef.current?.click()}
            >
              {stagingFile ? 'Se încarcă…' : 'Încarcă pentru procesare ulterioară'}
            </Button>
          </div>
        </div>

        {stagedFilesLoading ? (
          <div className="px-4 py-3 text-sm text-muted-foreground animate-pulse">Se încarcă…</div>
        ) : stagedFiles.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            Niciun fișier în așteptare. Folosește butonul de mai sus pentru a încărca un Excel ce va
            putea fi procesat ulterior de un alt utilizator autorizat.
          </div>
        ) : (
          <ul className="divide-y">
            {stagedFiles.map((sf) => (
              <li key={sf.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{sf.originalFilename}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sf.uploadedByName} ·{' '}
                    {new Date(sf.uploadedAt).toLocaleDateString('ro-RO', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => handleProcessStaged(sf)}
                    disabled={phase === 'committing'}
                  >
                    Procesează
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteStaged(sf.id)}
                    disabled={phase === 'committing'}
                  >
                    Șterge
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">sau importă direct</span>
        </div>
      </div>

      {/* Step 1: pick company */}
      <div className="space-y-2">
        <Label htmlFor="company">
          {labels.companyLabel}
          {extendedMode && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              (opțional în modul extins)
            </span>
          )}
        </Label>
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
              {c.name} ({c.workplaces.length}{' '}
              {(labels.colWorkplace ?? 'locuri de muncă').toLowerCase()})
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {extendedMode
            ? 'Opțional — folosit ca rezervă pentru rândurile fără companie din fișier.'
            : labels.companyHelp}
        </p>
      </div>

      {/* Workplace vs. department explainer (spec §5) */}
      <WorkplaceDepartmentHelp locale={locale} />

      {/* How-to accordion */}
      <details className="border rounded-lg overflow-hidden">
        <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/50 text-sm font-medium select-none list-none">
          <span className="text-base leading-none shrink-0">ℹ</span>
          Cum completez fișierul Excel?
          <span className="ml-auto text-muted-foreground text-xs font-normal">
            click pentru detalii
          </span>
        </summary>
        <div className="px-4 pb-4 pt-1 space-y-4 text-sm border-t">
          <div className="space-y-1 pt-2">
            <p className="font-medium">Regula 1 — Date companie:</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Completează <code className="bg-muted px-1 rounded">nume_companie</code>,{' '}
              <code className="bg-muted px-1 rounded">cui_companie</code> și{' '}
              <code className="bg-muted px-1 rounded">adresa_companie</code> doar pe{' '}
              <strong>primul rând</strong> al fiecărei firme.
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">Regula 2 — Loc de muncă:</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Completează <code className="bg-muted px-1 rounded">loc_de_munca</code> pe fiecare
              rând. Dacă mai mulți angajați au același loc de muncă, scrie același nume — sistemul
              îl creează o singură dată.
            </p>
          </div>
          <p className="text-xs text-amber-800 border border-amber-200 bg-amber-50 rounded-md px-3 py-2">
            ⚠ Locurile de muncă create automat nu au hazarde asociate. După import, accesează
            fiecare companie pentru a completa profilul de risc.
          </p>
        </div>
      </details>

      {/* Step 2: upload file */}
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
                ? 'Antetele așteptate (toleranță la sinonime, ordine liberă):'
                : 'Expected headers (synonyms tolerated, any order):'}
            </p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>{labels.colFirstName}: prenume, first name</li>
              <li>{labels.colLastName}: nume, last name, surname</li>
              <li>{labels.colCnp ?? 'CNP'}: cnp, cod numeric personal</li>
              <li>{labels.colEmployeeId}: id angajat, marca, matricola</li>
              <li>{labels.colEmail}: email, e-mail</li>
              <li>{labels.colJobTitle ?? 'Funcție'}: functie, ocupatie</li>
              <li>
                {labels.colWorkplace ?? 'Loc de muncă'}: loc de munca, punct de lucru, locatie
              </li>
              <li>{labels.colDepartment}: departament, sectie, birou</li>
              <li>{labels.colHireDate ?? 'Data angajării'}: data angajarii, data angaj.</li>
              <li>
                {labels.colFitnessValidUntil ?? 'Expirare fișă aptitudine'}: expirare fisa
                aptitudine, valabil pana la
              </li>
              <li>{labels.colNotes ?? 'Mențiuni'}: mentiuni, observatii, obs</li>
              <li>Nume companie / CUI / Adresă companie (opțional, pentru creare automată)</li>
            </ul>
            <div className="mt-2 flex gap-3 flex-wrap">
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(SIMPLE_TEMPLATE)}`}
                download="template_angajati.csv"
                className="text-primary hover:underline"
              >
                {labels.downloadTemplate} (simplu)
              </a>
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(EXTENDED_TEMPLATE)}`}
                download="template_angajati_extins.csv"
                className="text-primary hover:underline"
              >
                {labels.downloadTemplate} (extins cu companii)
              </a>
            </div>
          </div>
        </details>
      </div>

      {/* Errors */}
      {error && (
        <div className="border border-destructive text-destructive bg-destructive/5 rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 text-amber-900 rounded-md p-3 text-sm space-y-1">
          {parseErrors.slice(0, 5).map((err) => (
            <div key={err}>{err}</div>
          ))}
          {parseErrors.length > 5 && (
            <div className="italic">... and {parseErrors.length - 5} more</div>
          )}
        </div>
      )}

      {sheetNotes.length > 0 && (
        <div className="border rounded-md p-3 text-xs text-muted-foreground space-y-0.5">
          {sheetNotes.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
      )}

      {/* Column mapping panel */}
      {mapping && (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
          {aiMappingLoading && (
            <div className="flex items-center gap-2 text-xs text-violet-600">
              <span className="inline-block w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              {labels.mappingAiLoading}
            </div>
          )}
          {aiMappingFailed && !aiMappingLoading && (
            <div className="text-xs text-amber-700">⚠ {labels.mappingAiTimeout}</div>
          )}
          {aiUsed && !aiMappingLoading && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 uppercase tracking-wide">
                AI
              </span>
              <p className="text-xs text-violet-600">{labels.mappingAiNote}</p>
            </div>
          )}

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
                          handleMappingOverride(header, e.target.value as ColumnKey | '')
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
          {diffResult && <RosterDiffPanel result={diffResult} labels={labels} />}

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id="skip-duplicates"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                disabled={phase === 'committing' || updateExisting}
              />
              <Label htmlFor="skip-duplicates" className="font-normal">
                {skipDuplicates ? labels.skipDuplicates : labels.importAnywayDuplicates}
              </Label>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                id="update-existing"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                disabled={phase === 'committing'}
                className="mt-0.5"
              />
              <Label htmlFor="update-existing" className="font-normal">
                {labels.updateExisting ??
                  'Actualizează angajații existenți cu datele din fișier'}
                <span className="block text-xs text-muted-foreground">
                  {labels.updateExistingHelp ??
                    'Suprascrie doar câmpurile completate și diferite (loc de muncă, funcție, email etc.). Celulele goale nu șterg date. Nu se modifică CNP, nume, data nașterii sau datele medicale.'}
                </span>
              </Label>
            </div>
          </div>

          <PreviewTable rows={rows} labels={labels} extendedMode={extendedMode} />

          <div className="flex flex-wrap items-center gap-2 sticky bottom-4 bg-background/95 backdrop-blur border rounded-lg p-3">
            <Button
              onClick={handleCommit}
              disabled={
                phase === 'committing' || rows.filter((r) => r.issues.length === 0).length === 0
              }
            >
              {phase === 'committing'
                ? commitProgress
                  ? `${labels.committing} ${commitProgress.done}/${commitProgress.total}`
                  : labels.committing
                : `${labels.commitButton} (${rows.filter((r) => r.issues.length === 0).length})`}
            </Button>
            <Button variant="outline" onClick={reset} disabled={phase === 'committing'}>
              {labels.resetButton}
            </Button>
            {phase === 'committing' &&
              commitProgress &&
              commitProgress.total > COMMIT_BATCH_SIZE && (
                <span className="text-xs text-muted-foreground">
                  {labels.committingBatches ?? 'Se importă în loturi…'}
                </span>
              )}
          </div>
        </>
      )}
    </div>
  )
}

function WorkplaceDepartmentHelp({ locale }: { locale: 'ro' | 'en' }) {
  const ro = locale === 'ro'
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-1">
      <p>
        <strong>{ro ? 'Loc de muncă' : 'Workplace'}</strong>{' '}
        {ro
          ? '= locul pentru care există riscuri, fișa postului și rechemări (entitatea pe care se bazează medicina muncii). Se creează automat dacă nu există.'
          : '= the place risks, the job sheet and recalls attach to (the entity medicina muncii is built on). Created automatically if missing.'}
      </p>
      <p>
        <strong>{ro ? 'Departament' : 'Department'}</strong>{' '}
        {ro
          ? '= unitatea organizatorică (serviciu, secție, birou). Este doar text descriptiv al locului de muncă, nu o entitate separată.'
          : '= the organizational unit (service, section, office). Descriptive text on the workplace, not a separate entity.'}
      </p>
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

  const existing = new Map<string, number>()
  const willCreate = new Map<string, number>()
  let noWorkplace = 0
  for (const row of rows) {
    if (row.issues.length > 0) continue
    if (row.workplaceStatus === 'existing') {
      const wp = workplaces.find((w) => w.id === row.workplaceId)
      const name = wp?.name ?? row.workplaceName ?? row.department ?? '?'
      existing.set(name, (existing.get(name) ?? 0) + 1)
    } else if (row.workplaceStatus === 'willCreate') {
      const name = row.newWorkplaceName ?? '?'
      willCreate.set(name, (willCreate.get(name) ?? 0) + 1)
    } else {
      noWorkplace++
    }
  }
  const hasBreakdown = existing.size > 0 || willCreate.size > 0 || noWorkplace > 0

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
        <div className="border rounded-lg p-3 text-xs space-y-3">
          <div className="font-medium text-muted-foreground uppercase tracking-wide text-xs">
            {labels.workplaceBreakdown}
          </div>

          {existing.size > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-green-700 uppercase">
                {labels.workplaceExisting ?? 'Loc de muncă existent'}
              </div>
              {Array.from(existing.entries()).map(([name, count]) => (
                <div key={name} className="flex justify-between">
                  <span className="text-foreground">{name}</span>
                  <span className="text-muted-foreground tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          )}

          {willCreate.size > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-blue-700 uppercase">
                {labels.workplaceWillCreate ?? 'Va fi creat'}
              </div>
              {Array.from(willCreate.entries()).map(([name, count]) => (
                <div key={name} className="flex justify-between">
                  <span className="text-foreground">{name}</span>
                  <span className="text-muted-foreground tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          )}

          {noWorkplace > 0 && (
            <div className="flex justify-between text-amber-700">
              <span>{labels.workplaceNone ?? 'Fără loc de muncă'}</span>
              <span className="tabular-nums">{noWorkplace}</span>
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
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</div>
    </div>
  )
}

function PreviewTable({
  rows,
  labels,
  extendedMode,
}: {
  rows: AnnotatedRow[]
  labels: Record<string, string>
  extendedMode: boolean
}) {
  const multiSheet = rows.some((r) => r.sheetName)
  const anyCnp = rows.some((r) => r.cnp)
  return (
    <div className="border rounded-lg overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-sm min-w-[700px]">
        <thead className="bg-muted/30 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-3 py-2">{labels.colRow}</th>
            {multiSheet && <th className="text-left px-3 py-2">{labels.colSheet ?? 'Foaie'}</th>}
            <th className="text-left px-3 py-2">{labels.colStatus}</th>
            <th className="text-left px-3 py-2">{labels.colFirstName}</th>
            <th className="text-left px-3 py-2">{labels.colLastName}</th>
            {anyCnp && <th className="text-left px-3 py-2">{labels.colCnp ?? 'CNP'}</th>}
            <th className="text-left px-3 py-2">{labels.colEmployeeId}</th>
            <th className="text-left px-3 py-2">{labels.colEmail}</th>
            {extendedMode ? (
              <>
                <th className="text-left px-3 py-2">Companie</th>
                <th className="text-left px-3 py-2">CUI</th>
                <th className="text-left px-3 py-2">{labels.colWorkplace ?? 'Loc de muncă'}</th>
              </>
            ) : (
              <th className="text-left px-3 py-2">{labels.colWorkplace ?? 'Loc de muncă'}</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const hasIssues = r.issues.length > 0
            const hasWarnings = r.warnings.length > 0
            const rowClass = hasIssues ? 'bg-destructive/5' : hasWarnings ? 'bg-amber-50' : ''
            const masked = r.cnp ? (maskCnp(r.cnp) ?? `${r.cnp.slice(0, 2)}…`) : null
            const wpDisplay = r.workplaceName ?? r.department ?? null
            return (
              <tr key={r.rowNumber} className={rowClass}>
                <td className="px-3 py-2 text-muted-foreground text-xs font-mono">{r.rowNumber}</td>
                {multiSheet && (
                  <td className="px-3 py-2 text-muted-foreground text-xs">{r.sheetName ?? '—'}</td>
                )}
                <td className="px-3 py-2">
                  {hasIssues ? (
                    <div className="space-y-1">
                      <span className="text-xs text-destructive font-medium">
                        {labels.statusIssue}
                      </span>
                      {r.issues.map((issue) => (
                        <div key={issue} className="text-xs text-destructive">
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
                    <span className="text-xs text-green-700 font-medium">{labels.statusOk}</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.firstName || <span className="text-destructive">—</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.lastName || <span className="text-destructive">—</span>}
                </td>
                {anyCnp && (
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs whitespace-nowrap">
                    {masked ?? '—'}
                  </td>
                )}
                <td className="px-3 py-2 text-muted-foreground">{r.companyEmployeeId ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.email ?? '—'}</td>
                {extendedMode ? (
                  <>
                    <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">
                      {r.companyName ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                      {r.cui ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {wpDisplay ?? '—'}
                      {r.workplaceStatus === 'willCreate' && (
                        <span className="text-blue-700 text-xs ml-1">
                          ({labels.workplaceWillCreateTag ?? 'nou'})
                        </span>
                      )}
                    </td>
                  </>
                ) : (
                  <td className="px-3 py-2 text-muted-foreground">
                    {wpDisplay ?? '—'}
                    {r.workplaceStatus === 'willCreate' && (
                      <span className="text-blue-700 text-xs ml-1">
                        ({labels.workplaceWillCreateTag ?? 'nou'})
                      </span>
                    )}
                  </td>
                )}
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
              <li className="italic text-muted-foreground">… +{result.leaving.length - 20}</li>
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
            {result.moved.slice(0, 20).map((e) => (
              <li key={`${e.rowNumber}-${e.lastName}`} className="text-muted-foreground">
                {e.firstName} {e.lastName}: {e.fromWorkplace} → {e.toWorkplace}
              </li>
            ))}
            {result.moved.length > 20 && (
              <li className="italic text-muted-foreground">… +{result.moved.length - 20}</li>
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
    default:
      return code
  }
}

function warningLabel(code: string, labels: Record<string, string>): string {
  switch (code) {
    case 'no_workplace':
      return (
        labels.warningNoWorkplace ??
        'Fără loc de muncă sau departament — angajatul va fi creat fără atribuire'
      )
    case 'cnp_invalid':
      return labels.warningCnpInvalid ?? 'CNP invalid — angajatul se importă fără CNP'
    case 'hire_date_invalid':
      return labels.warningHireDateInvalid ?? 'Dată de angajare invalidă — se folosește data de azi'
    case 'hire_date_future':
      return labels.warningHireDateFuture ?? 'Dată de angajare în viitor — se folosește data de azi'
    case 'fitness_date_invalid':
      return labels.warningFitnessDateInvalid ?? 'Dată de expirare a fișei invalidă — ignorată'
    case 'duplicate_within_file_cnp':
      return labels.warningDuplicateCnp ?? 'Duplicat în fișier (același CNP)'
    case 'duplicate_within_file_name':
    case 'duplicate_within_file_email':
      return labels.warningDuplicateEmployee
    case 'incomplete_company_columns':
      return (
        labels.warningIncompleteCompany ?? 'CUI fără nume de companie — compania nu poate fi creată'
      )
    case 'workplace_without_company':
      return labels.warningWorkplaceWithoutCompany ?? 'Loc de muncă fără companie — nu va fi atașat'
    default:
      return code
  }
}

// CSV download templates (spec §5). Column order: Nume, Prenume, CNP,
// Functie, Loc de munca, Departament, Data angajarii, Expirare fisa
// aptitudine, Mentiuni (+ company columns in the extended one). Example
// CNPs are structurally valid.
const SIMPLE_TEMPLATE =
  '﻿nume,prenume,cnp,functie,loc de munca,departament,data angajarii,expirare fisa aptitudine,mentiuni\r\n' +
  'Popescu,Andreea,1850315120038,Sudor,Atelier sudură,Producție,15.03.2021,01.03.2026,noapte\r\n' +
  'Ionescu,Mihai,2900720401235,Operator,Atelier sudură,Producție,2022-09-01,,\r\n'

const EXTENDED_TEMPLATE =
  '﻿nume,prenume,cnp,functie,loc de munca,departament,data angajarii,expirare fisa aptitudine,mentiuni,nume_companie,cui_companie,adresa_companie\r\n' +
  'Popescu,Ion,1850315120038,Programator,Birou IT,IT,10.01.2020,01.06.2026,,SC Firma SRL,RO12345678,Str. Exemplu 1 Cluj\r\n' +
  'Ionescu,Maria,2900720401235,Tester,Birou IT,IT,,,,SC Firma SRL,RO12345678,\r\n' +
  'Constantin,Ana,,Operator,Atelier,Producție,,,,,,\r\n'
