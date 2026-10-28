/**
 * Deterministic clinical-content helpers for the sandbox fixtures and the
 * static-PDF script. Built on the real clinical-exam definition so the demo's
 * periodic sheets match the product's field set exactly.
 */

import {
  CLINICAL_ALL_NORMAL_ITEMS,
  CLINICAL_SPECIALTY_CONCLUSION,
} from '@/lib/examinations/clinical-exam'

/**
 * A fully "normal" clinicalExam object: every choice item in the systems exam
 * (sections 1–11) plus the clinical + specialty conclusions set to their
 * `normal` value. Mirrors what the real „Toate aparatele în limite normale"
 * button produces, so a finalized periodic exam shows a complete sheet.
 */
export function buildNormalClinicalExam(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const item of CLINICAL_ALL_NORMAL_ITEMS) {
    if (item.kind === 'choice' && item.normal) out[item.key] = item.normal
  }
  if (CLINICAL_SPECIALTY_CONCLUSION.normal) {
    out[CLINICAL_SPECIALTY_CONCLUSION.key] = CLINICAL_SPECIALTY_CONCLUSION.normal
  }
  return out
}
