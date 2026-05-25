'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DocumentEntityType, DocumentType } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/lib/format-date'

/**
 * Client component for the documents UI. Handles:
 *   - upload (with type picker dialog → file input → progress)
 *   - download (POSTs for a short signed URL → opens in a new tab,
 *     which forces the browser to use Content-Disposition: attachment)
 *   - delete (with confirm; official/generated docs are non-deletable)
 *
 * Documents arrive pre-serialized from the parent server component, so
 * this file doesn't need to know about BigInt or Date instances.
 */

interface DocumentListItem {
  id: string
  filename: string
  documentType: DocumentType
  mimeType: string
  fileSizeBytes: number
  isOfficial: boolean
  isGenerated: boolean
  createdAt: string
  uploadedBy: string | null
}

interface Labels {
  empty: string
  emptyHint: string
  uploadButton: string
  uploading: string
  delete: string
  deleteConfirm: string
  deleting: string
  download: string
  opening: string
  uploadedBy: string
  uploadedOn: string
  official: string
  generated: string
  chooseFile: string
  documentType: string
  submit: string
  cancel: string
  errorTitle: string
  allowedHint: string
  documentTypes: Record<DocumentType, string>
}

interface Props {
  entityType: DocumentEntityType
  entityId: string
  canWrite: boolean
  documents: DocumentListItem[]
  locale: 'ro' | 'en'
  labels: Labels
}

const DOCUMENT_TYPE_OPTIONS: DocumentType[] = [
  'lab_result',
  'referral',
  'adeverinta_medicala',
  'raport_medical',
  'dosarul_medical',
  'fisa_aptitudine',
  'fisa_factori_risc',
  'vaccination_certificate',
  'external_document',
  'other',
]

function formatFileSize(bytes: number, locale: 'ro' | 'en'): string {
  // Hand-rolled to match the server formatFileSize without importing across
  // the client/server boundary.
  const nbsp = '\u00A0'
  if (bytes < 1024) return `${bytes}${nbsp}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}${nbsp}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}${nbsp}MB`
}

export function DocumentsList({
  entityType,
  entityId,
  canWrite,
  documents,
  locale,
  labels,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<DocumentType>('other')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setUploadOpen(false)
    setSelectedType('other')
    setPendingFile(null)
    setUploading(false)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleUpload() {
    if (!pendingFile) return
    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', pendingFile)
    formData.append('entityType', entityType)
    formData.append('entityId', entityId)
    formData.append('documentType', selectedType)

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const issues = (data.issues as string[] | undefined)?.join('; ')
        setError(issues || data.message || data.error || 'Upload failed')
        setUploading(false)
        return
      }
      reset()
      startTransition(() => router.refresh())
    } catch (err) {
      console.error('Upload failed', err)
      setError('Network error during upload')
      setUploading(false)
    }
  }

  async function handleDownload(id: string) {
    setDownloadingId(id)
    setError(null)
    try {
      const response = await fetch(`/api/documents/${id}/download`, {
        method: 'POST',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.url) {
        setError(data.message || data.error || 'Download failed')
        setDownloadingId(null)
        return
      }
      // Open the signed URL — the `download` parameter on the signed URL
      // forces Content-Disposition: attachment, so this will save rather
      // than navigate.
      window.location.href = data.url
    } catch (err) {
      console.error('Download failed', err)
      setError('Network error during download')
    } finally {
      // Keep the spinner up briefly so the user sees feedback before the
      // browser starts the download.
      setTimeout(() => setDownloadingId(null), 1500)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(labels.deleteConfirm)) return
    setDeletingId(id)
    setError(null)
    try {
      const response = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.message || data.error || 'Delete failed')
        setDeletingId(null)
        return
      }
      startTransition(() => router.refresh())
    } catch (err) {
      console.error('Delete failed', err)
      setError('Network error during delete')
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {canWrite && (
        <div>
          {!uploadOpen ? (
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              + {labels.uploadButton}
            </Button>
          ) : (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="space-y-2">
                <Label htmlFor="docType">{labels.documentType}</Label>
                <select
                  id="docType"
                  value={selectedType}
                  onChange={(e) =>
                    setSelectedType(e.target.value as DocumentType)
                  }
                  disabled={uploading}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {DOCUMENT_TYPE_OPTIONS.map((dt) => (
                    <option key={dt} value={dt}>
                      {labels.documentTypes[dt]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="docFile">{labels.chooseFile}</Label>
                <input
                  ref={fileInputRef}
                  id="docFile"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {labels.allowedHint}
                </p>
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleUpload}
                  disabled={!pendingFile || uploading}
                >
                  {uploading ? labels.uploading : labels.submit}
                </Button>
                <Button
                  variant="outline"
                  onClick={reset}
                  disabled={uploading}
                >
                  {labels.cancel}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && !uploadOpen && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
          {error}
        </div>
      )}

      {documents.length === 0 ? (
        <EmptyState
          size="compact"
          illustration="documents"
          title={labels.empty}
          description={canWrite ? labels.emptyHint : undefined}
        />
      ) : (
        <div className="border rounded-lg divide-y">
          {documents.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {d.filename}
                  {(d.isOfficial || d.isGenerated) && (
                    <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-xs border align-middle">
                      {d.isOfficial ? labels.official : labels.generated}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{labels.documentTypes[d.documentType]}</span>
                  <span>•</span>
                  <span>{formatFileSize(d.fileSizeBytes, locale)}</span>
                  <span>•</span>
                  <span>
                    {labels.uploadedOn} {formatDate(d.createdAt, 'datetime', locale === 'ro' ? 'ro' : 'en')}
                  </span>
                  {d.uploadedBy && (
                    <>
                      <span>•</span>
                      <span>
                        {labels.uploadedBy} {d.uploadedBy}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(d.id)}
                  disabled={downloadingId === d.id || deletingId === d.id}
                >
                  {downloadingId === d.id ? labels.opening : labels.download}
                </Button>
                {canWrite && !d.isOfficial && !d.isGenerated && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(d.id)}
                    disabled={deletingId === d.id || downloadingId === d.id}
                  >
                    {deletingId === d.id ? labels.deleting : labels.delete}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
