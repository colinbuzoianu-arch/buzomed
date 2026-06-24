import { VerdictBadge } from '@/components/ui/verdict-badge'

const REQUEST_SOURCE_LABELS: Record<string, string> = {
  employer_request: 'Solicitarea angajatorului',
  periodic_due: 'Periodic (la scadență)',
  employee_request: 'Solicitarea angajatului',
  legal_obligation: 'Obligație legală',
  other: 'Altă cauză',
}

interface PatientContextPanelProps {
  requestSource: string | null
  examinationTypeName: string
  referringDocumentNumber: string | null
  workplaceName: string
  priorVerdict: string | null
  medicCurantName?: string | null
  medicCurantPhone?: string | null
}

export function PatientContextPanel({
  requestSource,
  examinationTypeName,
  referringDocumentNumber,
  workplaceName,
  priorVerdict,
  medicCurantName,
  medicCurantPhone,
}: PatientContextPanelProps) {
  const hasMedicCurant = !!(medicCurantName || medicCurantPhone)
  const colCount = hasMedicCurant ? 6 : 5

  return (
    <div className="border rounded-lg bg-card px-4 py-3">
      <div
        className={`grid grid-cols-2 gap-x-4 gap-y-3 ${
          colCount === 6 ? 'md:grid-cols-6' : 'md:grid-cols-5'
        }`}
      >
        <Field
          label="Motiv trimitere"
          value={requestSource ? (REQUEST_SOURCE_LABELS[requestSource] ?? requestSource) : '—'}
        />
        <Field label="Tip examinare" value={examinationTypeName} />
        <Field
          label="Document trimitere"
          value={referringDocumentNumber ?? '— nedeclarat —'}
          muted={!referringDocumentNumber}
        />
        <Field label="Loc de muncă" value={workplaceName} />
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Ultimul verdict
          </div>
          {priorVerdict ? (
            <VerdictBadge verdict={priorVerdict} />
          ) : (
            <span className="text-sm text-muted-foreground italic">— prima vizită —</span>
          )}
        </div>
        {hasMedicCurant && (
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Medic curant
            </div>
            <div className="space-y-0.5">
              {medicCurantName && <div className="text-sm">{medicCurantName}</div>}
              {medicCurantPhone && (
                <a
                  href={`tel:${medicCurantPhone}`}
                  className="text-sm text-primary hover:underline block"
                >
                  {medicCurantPhone}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <div className={`text-sm ${muted ? 'text-muted-foreground italic' : ''}`}>{value}</div>
    </div>
  )
}
