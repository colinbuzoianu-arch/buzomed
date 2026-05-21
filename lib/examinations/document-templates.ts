export interface DocumentDescriptor {
  key: string
  templateFile: string
  label: string
  required: boolean
}

export interface ExamSectionConfig {
  showAnamnesis: boolean
  showInitialIntake: boolean
  showVitalSigns: boolean
  showSystemsReview: boolean
  showVision: boolean
  showHearing: boolean
  showLung: boolean
  showAdditionalTests: boolean
  showFindings: boolean
  showVerdict: boolean
  showMaternityRisk: boolean
  showCertificateFields: boolean
}

const FISA_APTITUDINE: DocumentDescriptor = {
  key: 'fisa_aptitudine',
  templateFile: 'Fisa-Aptitudine-BLANK.pdf',
  label: 'Fișa de aptitudine',
  required: true,
}

const BILET_TRIMITERE: DocumentDescriptor = {
  key: 'bilet_trimitere',
  templateFile: 'Bilet-de-trimitere-BLANK.pdf',
  label: 'Bilet de trimitere',
  required: false,
}

export const EXAM_TYPE_DOCUMENTS: Record<string, DocumentDescriptor[]> = {
  angajare: [
    FISA_APTITUDINE,
    { key: 'examen_angajare', templateFile: 'Examen-medical-angajare-BLANK.pdf', label: 'Examen medical la angajare', required: true },
    { key: 'dosar_medical', templateFile: 'Dosar-Medical-BLANK.pdf', label: 'Dosar medical', required: true },
    BILET_TRIMITERE,
  ],
  control_periodic: [
    FISA_APTITUDINE,
    { key: 'examen_periodic', templateFile: 'Examen-medical-periodic-BLANK.pdf', label: 'Examen medical periodic', required: true },
    BILET_TRIMITERE,
  ],
  reluare_munca: [FISA_APTITUDINE, BILET_TRIMITERE],
  adaptare: [FISA_APTITUDINE, BILET_TRIMITERE],
  schimbare_loc_munca: [FISA_APTITUDINE, BILET_TRIMITERE],
  incetare_munca: [FISA_APTITUDINE, BILET_TRIMITERE],
  la_cerere: [
    FISA_APTITUDINE,
    { key: 'adeverinta', templateFile: 'Adeverinta-Medicala-BLANK.pdf', label: 'Adeverință medicală', required: false },
    BILET_TRIMITERE,
  ],
  protectia_maternitatii: [
    { key: 'raport_maternitate', templateFile: 'Raport-Protectia-Maternitatii-BLANK.pdf', label: 'Raport protecția maternității', required: true },
    { key: 'informare_maternitate', templateFile: 'Informare-Protectia-Maternitatii-BLANK.pdf', label: 'Informare protecția maternității', required: true },
  ],
  certificat_invatamant: [
    { key: 'certificat_invatamant', templateFile: 'Certificat-Medical-Invatamant-BLANK.pdf', label: 'Certificat medical — Învățământ', required: true },
  ],
  certificat_magistratura: [
    { key: 'certificat_magistratura', templateFile: 'Certificat-Medical-Magistratura-BLANK.pdf', label: 'Certificat medical — Magistratură', required: true },
  ],
}

const FULL_CLINICAL: ExamSectionConfig = {
  showAnamnesis: true,
  showInitialIntake: false,
  showVitalSigns: true,
  showSystemsReview: true,
  showVision: true,
  showHearing: false,
  showLung: false,
  showAdditionalTests: true,
  showFindings: true,
  showVerdict: true,
  showMaternityRisk: false,
  showCertificateFields: false,
}

const SECTION_CONFIGS: Record<string, ExamSectionConfig> = {
  angajare: { ...FULL_CLINICAL, showInitialIntake: true, showHearing: true, showLung: true },
  control_periodic: { ...FULL_CLINICAL, showHearing: true, showLung: true },
  reluare_munca: FULL_CLINICAL,
  adaptare: FULL_CLINICAL,
  schimbare_loc_munca: FULL_CLINICAL,
  incetare_munca: FULL_CLINICAL,
  la_cerere: FULL_CLINICAL,
  protectia_maternitatii: {
    showAnamnesis: false,
    showInitialIntake: false,
    showVitalSigns: false,
    showSystemsReview: false,
    showVision: false,
    showHearing: false,
    showLung: false,
    showAdditionalTests: false,
    showFindings: true,
    showVerdict: false,
    showMaternityRisk: true,
    showCertificateFields: false,
  },
  certificat_invatamant: {
    showAnamnesis: false,
    showInitialIntake: false,
    showVitalSigns: true,
    showSystemsReview: false,
    showVision: false,
    showHearing: false,
    showLung: false,
    showAdditionalTests: false,
    showFindings: false,
    showVerdict: false,
    showMaternityRisk: false,
    showCertificateFields: true,
  },
  certificat_magistratura: {
    showAnamnesis: false,
    showInitialIntake: false,
    showVitalSigns: true,
    showSystemsReview: false,
    showVision: false,
    showHearing: false,
    showLung: false,
    showAdditionalTests: false,
    showFindings: false,
    showVerdict: false,
    showMaternityRisk: false,
    showCertificateFields: true,
  },
}

export function getSectionsForExamType(code: string): ExamSectionConfig {
  return SECTION_CONFIGS[code] ?? FULL_CLINICAL
}
