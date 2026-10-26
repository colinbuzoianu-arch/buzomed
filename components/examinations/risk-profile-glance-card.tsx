import {
  parseRiskProfile,
  RISK_PROFILE_SCHEMA,
  type HazardEntry,
  type HazardSeverity,
} from '@/lib/workplaces/risk-profile'
import { formatDate } from '@/lib/format-date'

const HAZARD_LABELS: Record<string, string> = {
  // physical
  noise: 'zgomot',
  vibrations: 'vibrații',
  ionizingRadiation: 'radiații ionizante',
  electromagneticFields: 'câmpuri EM',
  extremeTemperatures: 'temp. extreme',
  lightingDeficiency: 'iluminat insuficient',
  // chemical
  dust: 'pulberi',
  fumes: 'fumuri',
  vapors: 'vapori',
  solvents: 'solvenți',
  heavyMetals: 'metale grele',
  acidsOrBases: 'acizi/baze',
  // biological
  bacteria: 'bacterii',
  viruses: 'virusuri',
  fungi: 'fungi',
  bloodbornePathogens: 'patogeni sanguini',
  // ergonomic
  manualHandling: 'manipulare manuală',
  repetitiveMovements: 'mișcări repetitive',
  awkwardPostures: 'posturi forțate',
  screenWork: 'VDT',
  nightShift: 'tura de noapte',
  // psychosocial
  workplaceStress: 'stres la muncă',
  isolatedWork: 'muncă izolată',
  violenceRisk: 'risc de violență',
}

function severityChipClass(severity: HazardSeverity | undefined): string {
  if (severity === 'high') return 'border-red-300 text-red-700 bg-red-50'
  if (severity === 'medium') return 'border-amber-300 text-amber-700 bg-amber-50'
  return 'border-gray-200 text-gray-600 bg-gray-50'
}

interface WorkplaceRiskProps {
  riskProfile: unknown
  riskAssessmentSignedByCompany: boolean
  riskAssessmentSignedAt: Date | null
}

interface RiskProfileRowProps {
  workplace: WorkplaceRiskProps
  hazardHintLabels: Record<string, string>
}

/**
 * Row 2 of the compact examination context card: only the hazards actually
 * declared present, as severity-colored chips, with the company-signature
 * badge pinned right and the investigation reminders trailing inline.
 */
export function RiskProfileRow({ workplace, hazardHintLabels }: RiskProfileRowProps) {
  const rp = parseRiskProfile(workplace.riskProfile)
  const hintValues = Object.values(hazardHintLabels)

  // Flatten every present hazard across all categories into one chip list,
  // keeping the schema's display order. Empty categories vanish entirely.
  const presentHazards = RISK_PROFILE_SCHEMA.flatMap(({ category, hazards }) => {
    const categoryData = rp[category] as Record<string, HazardEntry>
    return hazards
      .map((h) => ({ key: h, entry: categoryData[h] }))
      .filter(({ entry }) => entry?.present)
  })

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
      <span className="text-muted-foreground shrink-0">Riscuri:</span>

      {presentHazards.length > 0 ? (
        presentHazards.map(({ key: h, entry }) => (
          <span
            key={h}
            className={`inline-block rounded border px-1.5 py-0.5 text-[11px] leading-tight ${severityChipClass(entry.severity)}`}
          >
            {HAZARD_LABELS[h] ?? h}
          </span>
        ))
      ) : (
        <span className="text-muted-foreground italic">niciunul declarat</span>
      )}

      {/* Investigation reminders derived from the hazard profile. */}
      {hintValues.map((label) => (
        <span key={label} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <span className="text-amber-600">⚑</span>
          {label}
        </span>
      ))}

      {/* Company risk-assessment signature status, pinned to the right. */}
      {workplace.riskAssessmentSignedByCompany ? (
        <span className="ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 shrink-0">
          Semnat de firmă
          {workplace.riskAssessmentSignedAt && (
            <> · {formatDate(workplace.riskAssessmentSignedAt, 'short', 'ro')}</>
          )}
        </span>
      ) : (
        <span className="ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700 shrink-0">
          Nesemnat de firmă
        </span>
      )}
    </div>
  )
}
