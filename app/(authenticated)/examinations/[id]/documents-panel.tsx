'use client'

import { useState } from 'react'
import { EXAM_TYPE_DOCUMENTS } from '@/lib/examinations/document-templates'

interface DocumentsPanelLabels {
  title: string
  downloadBlank: string
  generateFilled: string
  generateFilledTooltip: string
  generating: string
  unsignedWarning: string
  badgeRequired: string
  badgeOptional: string
}

interface Props {
  examinationTypeCode: string
  examinationId: string
  employeeFullName: string
  locked: boolean
  isCancelled: boolean
  labels: DocumentsPanelLabels
}

export function DocumentsPanel({
  examinationTypeCode,
  examinationId,
  locked,
  isCancelled,
  labels,
}: Props) {
  const [loadingKeys, setLoadingKeys] = useState<Record<string, boolean>>({})
  const docs = EXAM_TYPE_DOCUMENTS[examinationTypeCode] ?? []

  if (docs.length === 0) return null

  async function handleGenerate(docKey: string) {
    setLoadingKeys((prev) => ({ ...prev, [docKey]: true }))
    try {
      window.open(`/api/examinations/${examinationId}/documents/${docKey}`, '_blank')
    } finally {
      setTimeout(() => {
        setLoadingKeys((prev) => ({ ...prev, [docKey]: false }))
      }, 1500)
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{labels.title}</h2>
      <div className="border rounded-lg divide-y">
        {docs.map((doc) => (
          <div
            key={doc.key}
            className="flex items-center justify-between px-4 py-3 gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-medium truncate">{doc.label}</span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border shrink-0 ${
                  doc.required
                    ? 'border-red-200 text-red-700 bg-red-50'
                    : 'border-gray-200 text-gray-600 bg-gray-50'
                }`}
              >
                {doc.required ? labels.badgeRequired : labels.badgeOptional}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`/templates/${doc.templateFile}`}
                download
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted transition-colors"
              >
                {labels.downloadBlank}
              </a>
              <button
                onClick={() => handleGenerate(doc.key)}
                disabled={loadingKeys[doc.key] || isCancelled}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingKeys[doc.key] ? (
                  <span className="flex items-center gap-1.5">
                    <svg
                      className="animate-spin h-3 w-3"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    {labels.generating}
                  </span>
                ) : (
                  labels.generateFilled
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
      {!locked && (
        <p className="text-xs text-amber-600 mt-2">{labels.unsignedWarning}</p>
      )}
    </section>
  )
}
