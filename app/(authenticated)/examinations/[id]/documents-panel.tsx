import { EXAM_TYPE_DOCUMENTS } from '@/lib/examinations/document-templates'

interface DocumentsPanelLabels {
  title: string
  downloadBlank: string
  generateFilled: string
  generateFilledTooltip: string
  badgeRequired: string
  badgeOptional: string
}

interface Props {
  examinationTypeCode: string
  examinationId: string
  employeeFullName: string
  locked: boolean
  labels: DocumentsPanelLabels
}

export function DocumentsPanel({ examinationTypeCode, labels }: Props) {
  const docs = EXAM_TYPE_DOCUMENTS[examinationTypeCode] ?? []

  if (docs.length === 0) return null

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
              <span title={labels.generateFilledTooltip}>
                <button
                  disabled
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md border border-input bg-muted text-muted-foreground cursor-not-allowed"
                >
                  {labels.generateFilled}
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
