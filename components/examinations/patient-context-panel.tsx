import { ClipboardList, CircleHelp, FileText, History, MapPin, Stethoscope } from 'lucide-react'
import { Fragment } from 'react'
import { VerdictBadge } from '@/components/ui/verdict-badge'

const REQUEST_SOURCE_LABELS: Record<string, string> = {
  employer_request: 'Solicitarea angajatorului',
  periodic_due: 'Periodic (la scadență)',
  employee_request: 'Solicitarea angajatului',
  legal_obligation: 'Obligație legală',
  other: 'Altă cauză',
}

interface PatientContextRowProps {
  requestSource: string | null
  examinationTypeName: string
  referringDocumentNumber: string | null
  workplaceName: string
  priorVerdict: string | null
  hasPriorExam: boolean
  medicCurantName?: string | null
  medicCurantPhone?: string | null
  practitionerName?: string | null
}

// Shared icon styling for the leading glyph on each inline item.
const itemIconClass = 'h-3.5 w-3.5 text-muted-foreground/70 shrink-0'

/**
 * Row 1 of the compact examination context card: a single line of inline
 * facts separated by middots, wrapping only when the viewport forces it.
 * Inline labels appear only where the value would be ambiguous on its own
 * (Motiv / Document / Ultimul verdict); everything else is bare text.
 */
export function PatientContextRow({
  requestSource,
  examinationTypeName,
  referringDocumentNumber,
  workplaceName,
  priorVerdict,
  hasPriorExam,
  medicCurantName,
  medicCurantPhone,
  practitionerName,
}: PatientContextRowProps) {
  const hasMedicCurant = !!(medicCurantName || medicCurantPhone)
  const requestSourceLabel = requestSource
    ? (REQUEST_SOURCE_LABELS[requestSource] ?? requestSource)
    : null

  const items: Array<{ id: string; node: React.ReactNode }> = []

  if (practitionerName) {
    items.push({
      id: 'practitioner',
      node: (
        <span className="inline-flex items-center gap-1.5">
          <Stethoscope className={itemIconClass} />
          {practitionerName}
        </span>
      ),
    })
  }

  // Exam type reads as a soft pill; its icon inherits the pill's primary colour.
  items.push({
    id: 'type',
    node: (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
        <ClipboardList className="h-3.5 w-3.5 shrink-0" />
        {examinationTypeName}
      </span>
    ),
  })

  items.push({
    id: 'workplace',
    node: (
      <span className="inline-flex items-center gap-1.5">
        <MapPin className={itemIconClass} />
        {workplaceName}
      </span>
    ),
  })

  items.push({
    id: 'motiv',
    node: (
      <span className="inline-flex items-center gap-1.5">
        <CircleHelp className={itemIconClass} />
        <span className="text-muted-foreground">Motiv: </span>
        {requestSourceLabel ?? <span className="text-muted-foreground italic">nedeclarat</span>}
      </span>
    ),
  })

  items.push({
    id: 'document',
    node: (
      <span className="inline-flex items-center gap-1.5">
        <FileText className={itemIconClass} />
        <span className="text-muted-foreground">Document: </span>
        {referringDocumentNumber ?? (
          <span className="italic text-amber-700 dark:text-amber-400">nedeclarat</span>
        )}
      </span>
    ),
  })

  items.push({
    id: 'verdict',
    node: (
      <span className="inline-flex items-center gap-1.5">
        <History className={itemIconClass} />
        <span className="text-muted-foreground">Ultimul verdict:</span>
        {priorVerdict ? (
          <VerdictBadge verdict={priorVerdict} />
        ) : hasPriorExam ? (
          <span className="text-muted-foreground italic">fără verdict</span>
        ) : (
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            prima vizită
          </span>
        )}
      </span>
    ),
  })

  if (hasMedicCurant) {
    items.push({
      id: 'medic',
      node: (
        <span className="inline-flex items-center gap-1.5">
          {medicCurantName && <span>{medicCurantName}</span>}
          {medicCurantPhone && (
            <a href={`tel:${medicCurantPhone}`} className="text-primary hover:underline">
              {medicCurantPhone}
            </a>
          )}
        </span>
      ),
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {items.map(({ id, node }, i) => (
        <Fragment key={id}>
          {i > 0 && <span className="text-muted-foreground/40">·</span>}
          {node}
        </Fragment>
      ))}
    </div>
  )
}
