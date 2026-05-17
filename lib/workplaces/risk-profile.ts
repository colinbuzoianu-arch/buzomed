export type HazardSeverity = 'low' | 'medium' | 'high'

export interface HazardEntry {
  present: boolean
  severity?: HazardSeverity
  notes?: string | null
}

export interface RiskProfileCategory {
  [hazardKey: string]: HazardEntry
}

export interface RiskProfile {
  physical: {
    noise: HazardEntry
    vibrations: HazardEntry
    ionizingRadiation: HazardEntry
    electromagneticFields: HazardEntry
    extremeTemperatures: HazardEntry
    lightingDeficiency: HazardEntry
  }
  chemical: {
    dust: HazardEntry
    fumes: HazardEntry
    vapors: HazardEntry
    solvents: HazardEntry
    heavyMetals: HazardEntry
    acidsOrBases: HazardEntry
  }
  biological: {
    bacteria: HazardEntry
    viruses: HazardEntry
    fungi: HazardEntry
    bloodbornePathogens: HazardEntry
  }
  ergonomic: {
    manualHandling: HazardEntry
    repetitiveMovements: HazardEntry
    awkwardPostures: HazardEntry
    screenWork: HazardEntry
    nightShift: HazardEntry
  }
  psychosocial: {
    workplaceStress: HazardEntry
    isolatedWork: HazardEntry
    violenceRisk: HazardEntry
  }
}

export type RiskProfileCategoryKey = keyof RiskProfile

/** Master list of all categories and their hazard keys, in display order. */
export const RISK_PROFILE_SCHEMA: Array<{
  category: RiskProfileCategoryKey
  hazards: string[]
}> = [
  {
    category: 'physical',
    hazards: [
      'noise',
      'vibrations',
      'ionizingRadiation',
      'electromagneticFields',
      'extremeTemperatures',
      'lightingDeficiency',
    ],
  },
  {
    category: 'chemical',
    hazards: ['dust', 'fumes', 'vapors', 'solvents', 'heavyMetals', 'acidsOrBases'],
  },
  {
    category: 'biological',
    hazards: ['bacteria', 'viruses', 'fungi', 'bloodbornePathogens'],
  },
  {
    category: 'ergonomic',
    hazards: [
      'manualHandling',
      'repetitiveMovements',
      'awkwardPostures',
      'screenWork',
      'nightShift',
    ],
  },
  {
    category: 'psychosocial',
    hazards: ['workplaceStress', 'isolatedWork', 'violenceRisk'],
  },
]

export function emptyHazardEntry(): HazardEntry {
  return { present: false }
}

export function emptyRiskProfile(): RiskProfile {
  return {
    physical: {
      noise: emptyHazardEntry(),
      vibrations: emptyHazardEntry(),
      ionizingRadiation: emptyHazardEntry(),
      electromagneticFields: emptyHazardEntry(),
      extremeTemperatures: emptyHazardEntry(),
      lightingDeficiency: emptyHazardEntry(),
    },
    chemical: {
      dust: emptyHazardEntry(),
      fumes: emptyHazardEntry(),
      vapors: emptyHazardEntry(),
      solvents: emptyHazardEntry(),
      heavyMetals: emptyHazardEntry(),
      acidsOrBases: emptyHazardEntry(),
    },
    biological: {
      bacteria: emptyHazardEntry(),
      viruses: emptyHazardEntry(),
      fungi: emptyHazardEntry(),
      bloodbornePathogens: emptyHazardEntry(),
    },
    ergonomic: {
      manualHandling: emptyHazardEntry(),
      repetitiveMovements: emptyHazardEntry(),
      awkwardPostures: emptyHazardEntry(),
      screenWork: emptyHazardEntry(),
      nightShift: emptyHazardEntry(),
    },
    psychosocial: {
      workplaceStress: emptyHazardEntry(),
      isolatedWork: emptyHazardEntry(),
      violenceRisk: emptyHazardEntry(),
    },
  }
}

/** Safely coerce Prisma's JsonValue into a typed RiskProfile. */
export function parseRiskProfile(raw: unknown): RiskProfile {
  const base = emptyRiskProfile()
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return base

  const src = raw as Record<string, unknown>
  for (const { category, hazards } of RISK_PROFILE_SCHEMA) {
    const catSrc =
      typeof src[category] === 'object' && src[category] !== null
        ? (src[category] as Record<string, unknown>)
        : {}
    for (const hazard of hazards) {
      const entry = catSrc[hazard]
      if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
        const e = entry as Record<string, unknown>
        ;(base[category] as Record<string, HazardEntry>)[hazard] = {
          present: e.present === true,
          severity:
            e.severity === 'low' || e.severity === 'medium' || e.severity === 'high'
              ? (e.severity as HazardSeverity)
              : undefined,
          notes: typeof e.notes === 'string' ? e.notes : null,
        }
      }
    }
  }
  return base
}

/** Count how many hazards are present across all categories. */
export function countActiveHazards(profile: RiskProfile): number {
  let count = 0
  for (const { category, hazards } of RISK_PROFILE_SCHEMA) {
    for (const hazard of hazards) {
      if ((profile[category] as Record<string, HazardEntry>)[hazard]?.present) {
        count++
      }
    }
  }
  return count
}
