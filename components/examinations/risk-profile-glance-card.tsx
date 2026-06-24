import { Volume2, FlaskConical, Microscope, Dumbbell, Brain } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  parseRiskProfile,
  RISK_PROFILE_SCHEMA,
  type HazardEntry,
  type HazardSeverity,
  type RiskProfileCategoryKey,
} from '@/lib/workplaces/risk-profile'
import { formatDate } from '@/lib/format-date'

const CATEGORY_META: Array<{
  key: RiskProfileCategoryKey
  label: string
  Icon: LucideIcon
}> = [
  { key: 'physical', label: 'Fizici', Icon: Volume2 },
  { key: 'chemical', label: 'Chimici', Icon: FlaskConical },
  { key: 'biological', label: 'Biologici', Icon: Microscope },
  { key: 'ergonomic', label: 'Ergonomici', Icon: Dumbbell },
  { key: 'psychosocial', label: 'Psihosociali', Icon: Brain },
]

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

interface RiskProfileGlanceCardProps {
  workplace: WorkplaceRiskProps
  hazardHintLabels: Record<string, string>
}

export function RiskProfileGlanceCard({
  workplace,
  hazardHintLabels,
}: RiskProfileGlanceCardProps) {
  const rp = parseRiskProfile(workplace.riskProfile)
  const hintValues = Object.values(hazardHintLabels)

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-wrap gap-2">
        <span className="text-sm font-semibold">Profil de risc — loc de muncă</span>
        {workplace.riskAssessmentSignedByCompany ? (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border border-emerald-200 bg-emerald-50 text-emerald-700">
            Semnat de firmă
            {workplace.riskAssessmentSignedAt && (
              <> · {formatDate(workplace.riskAssessmentSignedAt, 'short', 'ro')}</>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700">
            Nesemnat de firmă
          </span>
        )}
      </div>

      {/* Body: 5 hazard categories */}
      <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0">
        {CATEGORY_META.map(({ key, label, Icon }) => {
          const schemaEntry = RISK_PROFILE_SCHEMA.find((e) => e.category === key)
          const categoryData = rp[key] as Record<string, HazardEntry>
          const presentHazards = schemaEntry
            ? schemaEntry.hazards
                .map((h) => ({ key: h, entry: categoryData[h] }))
                .filter(({ entry }) => entry?.present)
            : []

          return (
            <div key={key} className="px-3 py-3 space-y-2 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </div>
              {presentHazards.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {presentHazards.map(({ key: h, entry }) => (
                    <span
                      key={h}
                      className={`inline-block rounded border px-1.5 py-0.5 text-[11px] leading-tight ${severityChipClass(entry.severity)}`}
                    >
                      {HAZARD_LABELS[h] ?? h}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground italic">— absent —</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer: investigation reminders derived from hazard hints */}
      {hintValues.length > 0 && (
        <div className="border-t px-4 py-2 bg-muted/30">
          <p className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
            {hintValues.map((label, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <span className="text-amber-600">⚑</span>
                {label}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  )
}
