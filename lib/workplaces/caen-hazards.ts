import type { RiskProfileCategoryKey } from './risk-profile'

/**
 * Hazard suggestions keyed by risk profile category.
 * Each entry is a list of hazard keys that are typically present for a given
 * CAEN sector. These are suggestions only — the user can accept, modify, or
 * ignore them.
 */
export type HazardSuggestions = Partial<Record<RiskProfileCategoryKey, string[]>>

/**
 * Lookup table: CAEN code prefix → typical hazard suggestions.
 *
 * Keys are matched longest-first (4-digit exact match, then 2-digit prefix).
 * All codes are Romanian CAEN (= EU NACE Rev. 2).
 *
 * Coverage intentionally focuses on sectors seen in Romanian occupational
 * medicine practices; sectors with purely office-based risk profiles (e.g.
 * finance 64–66) are omitted because the user will see the blank form and
 * know there is nothing to suggest.
 */
const CAEN_SUGGESTIONS: Record<string, HazardSuggestions> = {
  // ── Agriculture, forestry, fishing (01–03) ────────────────────────────
  '01': {
    physical: ['dust', 'extremeTemperatures'],
    biological: ['bacteria', 'fungi'],
    ergonomic: ['manualHandling', 'awkwardPostures'],
    psychosocial: ['isolatedWork'],
  },
  '02': {
    physical: ['noise', 'vibrations', 'extremeTemperatures'],
    ergonomic: ['manualHandling', 'awkwardPostures'],
    psychosocial: ['isolatedWork'],
  },
  '03': {
    physical: ['extremeTemperatures'],
    biological: ['bacteria', 'fungi'],
    ergonomic: ['manualHandling'],
  },

  // ── Mining & quarrying (05–09) ────────────────────────────────────────
  '05': {
    physical: ['noise', 'vibrations', 'dust', 'extremeTemperatures', 'ionizingRadiation'],
    ergonomic: ['manualHandling', 'awkwardPostures'],
    psychosocial: ['isolatedWork'],
  },
  '06': {
    physical: ['noise', 'vibrations', 'extremeTemperatures'],
    chemical: ['fumes', 'vapors'],
    ergonomic: ['manualHandling'],
  },
  '08': {
    physical: ['noise', 'vibrations', 'dust', 'extremeTemperatures'],
    ergonomic: ['manualHandling'],
  },
  '09': {
    physical: ['noise', 'vibrations', 'dust'],
    ergonomic: ['manualHandling'],
  },

  // ── Food & beverage manufacturing (10–12) ────────────────────────────
  '10': {
    physical: ['dust', 'extremeTemperatures', 'noise'],
    biological: ['bacteria', 'fungi'],
    ergonomic: ['manualHandling', 'repetitiveMovements'],
  },
  '11': {
    physical: ['dust', 'extremeTemperatures'],
    chemical: ['vapors'],
    ergonomic: ['manualHandling'],
  },
  '12': {
    chemical: ['dust', 'vapors'],
    ergonomic: ['repetitiveMovements'],
  },

  // ── Textiles, apparel, leather (13–15) ───────────────────────────────
  '13': {
    physical: ['dust', 'noise'],
    chemical: ['solvents'],
    ergonomic: ['repetitiveMovements', 'awkwardPostures'],
  },
  '14': {
    physical: ['dust'],
    chemical: ['solvents'],
    ergonomic: ['repetitiveMovements'],
  },
  '15': {
    chemical: ['solvents', 'vapors'],
    ergonomic: ['repetitiveMovements', 'manualHandling'],
  },

  // ── Wood, paper, printing (16–18) ────────────────────────────────────
  '16': {
    physical: ['dust', 'noise', 'vibrations'],
    chemical: ['solvents'],
    ergonomic: ['manualHandling'],
  },
  '17': {
    physical: ['dust', 'noise'],
    chemical: ['solvents', 'vapors'],
    ergonomic: ['manualHandling'],
  },
  '18': {
    chemical: ['solvents', 'vapors'],
    ergonomic: ['repetitiveMovements', 'screenWork'],
  },

  // ── Petroleum & chemicals (19–20) ────────────────────────────────────
  '19': {
    physical: ['extremeTemperatures'],
    chemical: ['fumes', 'vapors', 'solvents'],
    ergonomic: ['manualHandling'],
  },
  '20': {
    chemical: ['dust', 'fumes', 'vapors', 'solvents', 'acidsOrBases', 'heavyMetals'],
    physical: ['extremeTemperatures'],
    ergonomic: ['manualHandling'],
  },

  // ── Pharmaceuticals (21) ─────────────────────────────────────────────
  '21': {
    physical: ['dust'],
    chemical: ['solvents', 'vapors', 'fumes'],
    biological: ['bacteria', 'viruses', 'fungi'],
    ergonomic: ['repetitiveMovements'],
  },

  // ── Rubber, plastics, non-metallic minerals (22–23) ──────────────────
  '22': {
    physical: ['noise', 'extremeTemperatures'],
    chemical: ['fumes', 'vapors', 'solvents'],
    ergonomic: ['manualHandling'],
  },
  '23': {
    physical: ['dust', 'noise', 'extremeTemperatures'],
    chemical: ['fumes'],
    ergonomic: ['manualHandling'],
  },

  // ── Basic metals & fabricated metal products (24–25) ─────────────────
  '24': {
    physical: ['noise', 'vibrations', 'extremeTemperatures', 'electromagneticFields'],
    chemical: ['fumes', 'dust', 'heavyMetals'],
    ergonomic: ['manualHandling', 'awkwardPostures'],
  },
  '25': {
    physical: ['noise', 'vibrations', 'extremeTemperatures'],
    chemical: ['fumes', 'dust', 'solvents', 'heavyMetals', 'acidsOrBases'],
    ergonomic: ['manualHandling', 'awkwardPostures'],
  },

  // ── Electronics & electrical equipment (26–27) ───────────────────────
  '26': {
    physical: ['electromagneticFields'],
    chemical: ['solvents'],
    ergonomic: ['screenWork', 'repetitiveMovements'],
  },
  '27': {
    physical: ['electromagneticFields', 'noise'],
    chemical: ['solvents'],
    ergonomic: ['manualHandling'],
  },

  // ── Machinery & vehicles (28–30) ─────────────────────────────────────
  '28': {
    physical: ['noise', 'vibrations'],
    chemical: ['fumes', 'dust', 'solvents'],
    ergonomic: ['manualHandling', 'awkwardPostures'],
  },
  '29': {
    physical: ['noise', 'vibrations'],
    chemical: ['fumes', 'dust', 'solvents'],
    ergonomic: ['manualHandling'],
  },
  '30': {
    physical: ['noise', 'vibrations'],
    chemical: ['fumes', 'dust', 'solvents'],
    ergonomic: ['manualHandling'],
  },

  // ── Furniture & other manufacturing (31–33) ──────────────────────────
  '31': {
    physical: ['dust', 'noise'],
    chemical: ['solvents', 'fumes', 'vapors'],
    ergonomic: ['manualHandling', 'repetitiveMovements'],
  },
  '32': {
    physical: ['noise'],
    chemical: ['solvents', 'dust'],
    ergonomic: ['repetitiveMovements'],
  },
  '33': {
    physical: ['noise'],
    chemical: ['solvents', 'fumes'],
    ergonomic: ['manualHandling'],
  },

  // ── Utilities / energy (35–39) ───────────────────────────────────────
  '35': {
    physical: ['noise', 'extremeTemperatures', 'electromagneticFields', 'ionizingRadiation'],
    ergonomic: ['manualHandling'],
  },
  '36': {
    chemical: ['solvents', 'acidsOrBases'],
    ergonomic: ['manualHandling'],
  },
  '38': {
    chemical: ['dust', 'fumes', 'solvents', 'acidsOrBases'],
    biological: ['bacteria', 'fungi'],
    ergonomic: ['manualHandling'],
  },
  '39': {
    chemical: ['solvents', 'acidsOrBases'],
    ergonomic: ['manualHandling'],
  },

  // ── Construction (41–43) ─────────────────────────────────────────────
  '41': {
    physical: ['noise', 'vibrations', 'dust', 'extremeTemperatures'],
    ergonomic: ['manualHandling', 'awkwardPostures'],
  },
  '42': {
    physical: ['noise', 'vibrations', 'dust', 'extremeTemperatures'],
    ergonomic: ['manualHandling', 'awkwardPostures'],
  },
  '43': {
    physical: ['noise', 'vibrations', 'dust', 'extremeTemperatures'],
    chemical: ['solvents', 'fumes', 'dust'],
    ergonomic: ['manualHandling', 'awkwardPostures'],
  },

  // ── Wholesale & retail (45–47) ───────────────────────────────────────
  '45': {
    ergonomic: ['manualHandling', 'repetitiveMovements', 'screenWork'],
    psychosocial: ['workplaceStress'],
  },
  '46': {
    ergonomic: ['manualHandling', 'screenWork'],
    psychosocial: ['workplaceStress'],
  },
  '47': {
    ergonomic: ['manualHandling', 'repetitiveMovements', 'screenWork'],
    psychosocial: ['workplaceStress', 'violenceRisk'],
  },

  // ── Transport & storage (49–53) ──────────────────────────────────────
  '49': {
    physical: ['noise', 'vibrations'],
    ergonomic: ['awkwardPostures', 'nightShift'],
    psychosocial: ['workplaceStress', 'isolatedWork'],
  },
  '50': {
    physical: ['noise', 'vibrations', 'extremeTemperatures'],
    ergonomic: ['nightShift'],
    psychosocial: ['isolatedWork'],
  },
  '51': {
    physical: ['noise', 'vibrations', 'electromagneticFields'],
    ergonomic: ['nightShift', 'screenWork'],
    psychosocial: ['workplaceStress'],
  },
  '52': {
    ergonomic: ['manualHandling', 'repetitiveMovements', 'nightShift'],
    psychosocial: ['workplaceStress'],
  },
  '53': {
    ergonomic: ['manualHandling', 'repetitiveMovements'],
    psychosocial: ['workplaceStress', 'isolatedWork'],
  },

  // ── Accommodation & food service (55–56) ─────────────────────────────
  '55': {
    physical: ['extremeTemperatures'],
    ergonomic: ['manualHandling', 'repetitiveMovements', 'nightShift'],
    psychosocial: ['workplaceStress'],
  },
  '56': {
    physical: ['extremeTemperatures', 'noise'],
    ergonomic: ['manualHandling', 'repetitiveMovements'],
    psychosocial: ['workplaceStress', 'violenceRisk'],
  },

  // ── IT & telecommunications (61–63) ──────────────────────────────────
  '61': {
    physical: ['electromagneticFields'],
    ergonomic: ['screenWork', 'awkwardPostures'],
    psychosocial: ['workplaceStress'],
  },
  '62': {
    ergonomic: ['screenWork', 'awkwardPostures'],
    psychosocial: ['workplaceStress'],
  },
  '63': {
    ergonomic: ['screenWork'],
    psychosocial: ['workplaceStress'],
  },

  // ── Security & investigation (80) ────────────────────────────────────
  '80': {
    ergonomic: ['nightShift'],
    psychosocial: ['isolatedWork', 'violenceRisk', 'workplaceStress'],
  },

  // ── Building & landscape services (81) ───────────────────────────────
  '81': {
    physical: ['extremeTemperatures'],
    chemical: ['solvents'],
    ergonomic: ['manualHandling', 'repetitiveMovements'],
  },

  // ── Human health activities (86) ─────────────────────────────────────
  '86': {
    biological: ['bacteria', 'viruses', 'bloodbornePathogens', 'fungi'],
    chemical: ['solvents', 'vapors'],
    ergonomic: ['manualHandling', 'nightShift'],
    psychosocial: ['workplaceStress', 'violenceRisk'],
  },

  // ── Residential care & social work (87–88) ───────────────────────────
  '87': {
    biological: ['bacteria', 'viruses', 'bloodbornePathogens'],
    ergonomic: ['manualHandling', 'nightShift'],
    psychosocial: ['workplaceStress', 'violenceRisk'],
  },
  '88': {
    biological: ['bacteria', 'viruses'],
    ergonomic: ['manualHandling'],
    psychosocial: ['workplaceStress', 'violenceRisk'],
  },
}

/**
 * Returns hazard suggestions for a CAEN code by trying:
 *   1. Exact 4-digit match
 *   2. First 2 digits (sector prefix)
 *   3. null if no suggestions available
 */
export function getHazardSuggestionsForCaen(
  caenCode: string | null | undefined
): HazardSuggestions | null {
  if (!caenCode) return null
  const clean = caenCode.trim().replace(/\s/g, '')
  if (!clean) return null

  if (CAEN_SUGGESTIONS[clean]) return CAEN_SUGGESTIONS[clean]

  const prefix = clean.slice(0, 2)
  return CAEN_SUGGESTIONS[prefix] ?? null
}
