/**
 * Fișa de aptitudine — PDF document built with @react-pdf/renderer.
 *
 * Uses React-PDF's Yoga flexbox layout engine. This is intentionally
 * NOT identical to the HTML fișa — it's a clean A4 document that
 * reads well when printed or sent by email. The HTML version remains
 * the "live preview"; this is the authoritative PDF artifact.
 *
 * Colours match the Buzomed brand palette:
 *   Deep blue:   #1e3a8a  (header, labels)
 *   Teal accent: #0d9488  (verdict highlight)
 *   Light grey:  #f1f5f9  (section background)
 *   Border:      #e2e8f0
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'

// Register Inter (already bundled by @react-pdf from Google Fonts proxy).
// Fallback to Helvetica if the font fails to load.
Font.register({
  family: 'Inter',
  fonts: [
    {
      src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2',
      fontWeight: 400,
    },
    {
      src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hiA.woff2',
      fontWeight: 600,
    },
    {
      src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hiA.woff2',
      fontWeight: 700,
    },
  ],
})

const BLUE = '#1e3a8a'
const TEAL = '#0d9488'
const LIGHT = '#f1f5f9'
const BORDER = '#e2e8f0'
const MUTED = '#64748b'

const S = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 9,
    color: '#1e293b',
    paddingHorizontal: 36,
    paddingVertical: 32,
  },

  // Watermark for unsigned drafts
  draft: {
    position: 'absolute',
    top: 200,
    left: 60,
    fontSize: 72,
    color: '#f87171',
    opacity: 0.15,
    fontWeight: 700,
    transform: 'rotate(-40deg)',
  },

  // Cabinet header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: `2px solid ${BLUE}`,
    paddingBottom: 8,
    marginBottom: 12,
  },
  cabinetName: {
    fontSize: 11,
    fontWeight: 700,
    color: BLUE,
  },
  cabinetAddress: {
    fontSize: 8,
    color: MUTED,
    marginTop: 2,
  },
  docTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: BLUE,
    textAlign: 'right',
  },
  docSubtitle: {
    fontSize: 8,
    color: MUTED,
    textAlign: 'right',
    marginTop: 2,
  },

  // Section blocks
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    backgroundColor: LIGHT,
    padding: '4 8',
    borderLeft: `3px solid ${BLUE}`,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: 600,
    color: BLUE,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Grid rows
  row: {
    flexDirection: 'row',
    borderBottom: `1px solid ${BORDER}`,
    paddingVertical: 3,
  },
  rowLast: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  label: {
    width: '38%',
    fontSize: 8,
    color: MUTED,
    fontWeight: 600,
  },
  value: {
    flex: 1,
    fontSize: 9,
  },

  // Verdict box
  verdictBox: {
    borderRadius: 4,
    padding: '8 12',
    marginBottom: 8,
  },
  verdictLabel: {
    fontSize: 8,
    fontWeight: 600,
    color: MUTED,
    marginBottom: 2,
  },
  verdictText: {
    fontSize: 13,
    fontWeight: 700,
  },

  // Vital signs grid
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  vitalCell: {
    width: '30%',
    backgroundColor: LIGHT,
    borderRadius: 3,
    padding: '4 6',
  },
  vitalLabel: {
    fontSize: 7,
    color: MUTED,
  },
  vitalValue: {
    fontSize: 10,
    fontWeight: 600,
    marginTop: 1,
  },

  // Footer / signature
  footer: {
    marginTop: 'auto',
    borderTop: `1px solid ${BORDER}`,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '45%',
  },
  signatureLabel: {
    fontSize: 8,
    color: MUTED,
    marginBottom: 20,
  },
  signatureLine: {
    borderTop: `1px solid #94a3b8`,
    paddingTop: 4,
    fontSize: 8,
  },
  pageNum: {
    fontSize: 7,
    color: MUTED,
    textAlign: 'center',
    marginTop: 8,
  },
})

interface VitalSigns {
  height: number | null
  weight: number | null
  bmi: number | null
  bloodPressureSystolic: number | null
  bloodPressureDiastolic: number | null
  heartRate: number | null
}

export interface FisaPdfProps {
  cabinetName: string
  cabinetAddress: string
  examinationNumber: string
  examinationDate: string
  signedAt: string | null
  workerName: string
  workerBirthDate: string
  workerGender: string
  companyName: string
  companyCui: string
  workplaceName: string
  workplaceDepartment: string | null
  jobTitle: string | null
  examinationTypeName: string
  verdict: string | null
  verdictConditions: string | null
  nextExaminationDueDate: string
  inaptUntil: string | null
  clinicalFindings: string | null
  vitalSigns: VitalSigns
  practitionerName: string
  practitionerTitle: string | null
  practitionerCode: string | null
  isDraft: boolean
}

function verdictColor(verdict: string | null): string {
  switch (verdict) {
    case 'apt':
      return '#15803d' // green-700
    case 'apt_conditionat':
      return '#d97706' // amber-600
    case 'inapt_temporar':
      return '#d97706'
    case 'inapt':
      return '#dc2626' // red-600
    default:
      return MUTED
  }
}

function verdictLabel(verdict: string | null): string {
  switch (verdict) {
    case 'apt':
      return 'APT'
    case 'apt_conditionat':
      return 'APT CONDIȚIONAT'
    case 'inapt_temporar':
      return 'INAPT TEMPORAR'
    case 'inapt':
      return 'INAPT'
    default:
      return '—'
  }
}

export function FisaPdfDocument(props: FisaPdfProps) {
  const hasVitals =
    props.vitalSigns.height ||
    props.vitalSigns.weight ||
    props.vitalSigns.bloodPressureSystolic ||
    props.vitalSigns.heartRate

  return (
    <Document
      title={`Fișa de aptitudine Nr. ${props.examinationNumber}`}
      author={props.cabinetName}
      subject="Fișa de aptitudine în muncă"
      creator="Buzomed"
    >
      <Page size="A4" style={S.page}>
        {/* Draft watermark */}
        {props.isDraft && (
          <Text style={S.draft}>DRAFT</Text>
        )}

        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.cabinetName}>{props.cabinetName}</Text>
            <Text style={S.cabinetAddress}>{props.cabinetAddress}</Text>
          </View>
          <View>
            <Text style={S.docTitle}>FIȘA DE APTITUDINE</Text>
            <Text style={S.docSubtitle}>Nr. {props.examinationNumber}</Text>
            <Text style={S.docSubtitle}>{props.examinationDate}</Text>
          </View>
        </View>

        {/* Verdict — most important, shown prominently */}
        <View
          style={[
            S.verdictBox,
            {
              backgroundColor:
                props.verdict === 'apt'
                  ? '#f0fdf4'
                  : props.verdict === 'inapt'
                    ? '#fef2f2'
                    : '#fffbeb',
              border: `1.5px solid ${verdictColor(props.verdict)}`,
            },
          ]}
        >
          <Text style={S.verdictLabel}>VERDICT MEDICAL</Text>
          <Text
            style={[S.verdictText, { color: verdictColor(props.verdict) }]}
          >
            {verdictLabel(props.verdict)}
          </Text>
          {props.verdictConditions && (
            <Text style={{ fontSize: 8, color: '#374151', marginTop: 4 }}>
              {props.verdictConditions}
            </Text>
          )}
          {props.verdict === 'inapt_temporar' && props.inaptUntil && (
            <Text style={{ fontSize: 8, color: MUTED, marginTop: 2 }}>
              Până la: {props.inaptUntil}
            </Text>
          )}
        </View>

        {/* Worker section */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>Date angajat</Text>
          </View>
          <Row label="Nume și prenume" value={props.workerName} />
          <Row label="Data nașterii" value={props.workerBirthDate} />
          <Row
            label="Sex"
            value={
              props.workerGender === 'M'
                ? 'Masculin'
                : props.workerGender === 'F'
                  ? 'Feminin'
                  : props.workerGender
            }
            last
          />
        </View>

        {/* Employment section */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>Loc de muncă</Text>
          </View>
          <Row label="Companie" value={props.companyName} />
          <Row label="CUI" value={props.companyCui} />
          <Row label="Loc de muncă" value={props.workplaceName} />
          {props.workplaceDepartment && (
            <Row
              label="Departament"
              value={props.workplaceDepartment}
            />
          )}
          {props.jobTitle && (
            <Row label="Funcție" value={props.jobTitle} />
          )}
          <Row
            label="Tip examinare"
            value={props.examinationTypeName}
            last
          />
        </View>

        {/* Vital signs */}
        {hasVitals && (
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionTitle}>Semne vitale</Text>
            </View>
            <View style={S.vitalsGrid}>
              {props.vitalSigns.height && (
                <VitalCell
                  label="Înălțime"
                  value={`${props.vitalSigns.height} cm`}
                />
              )}
              {props.vitalSigns.weight && (
                <VitalCell
                  label="Greutate"
                  value={`${props.vitalSigns.weight} kg`}
                />
              )}
              {props.vitalSigns.bmi && (
                <VitalCell
                  label="IMC"
                  value={String(props.vitalSigns.bmi)}
                />
              )}
              {props.vitalSigns.bloodPressureSystolic &&
                props.vitalSigns.bloodPressureDiastolic && (
                  <VitalCell
                    label="TA"
                    value={`${props.vitalSigns.bloodPressureSystolic}/${props.vitalSigns.bloodPressureDiastolic} mmHg`}
                  />
                )}
              {props.vitalSigns.heartRate && (
                <VitalCell
                  label="AV"
                  value={`${props.vitalSigns.heartRate} bpm`}
                />
              )}
            </View>
          </View>
        )}

        {/* Clinical findings — only if present */}
        {props.clinicalFindings && (
          <View style={S.section}>
            <View style={S.sectionHeader}>
              <Text style={S.sectionTitle}>Constatări clinice</Text>
            </View>
            <Text style={{ fontSize: 9, lineHeight: 1.4, paddingVertical: 4 }}>
              {props.clinicalFindings}
            </Text>
          </View>
        )}

        {/* Next examination */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>Reexaminare</Text>
          </View>
          <Row
            label="Data următoarei examinări"
            value={props.nextExaminationDueDate}
            last
          />
        </View>

        {/* Footer / signature */}
        <View style={S.footer}>
          <View style={S.signatureBlock}>
            <Text style={S.signatureLabel}>Data semnării:</Text>
            <Text style={S.signatureLine}>
              {props.signedAt ?? 'Nesemnat'}
            </Text>
          </View>
          <View style={S.signatureBlock}>
            <Text style={S.signatureLabel}>Medic de medicina muncii:</Text>
            <Text style={S.signatureLine}>
              {props.practitionerName}
              {props.practitionerTitle
                ? `\n${props.practitionerTitle}`
                : ''}
              {props.practitionerCode
                ? `\nParafă: ${props.practitionerCode}`
                : ''}
            </Text>
          </View>
        </View>

        <Text style={S.pageNum}>
          Buzomed — Medicina muncii · {props.examinationNumber}
        </Text>
      </Page>
    </Document>
  )
}

function Row({
  label,
  value,
  last = false,
}: {
  label: string
  value: string
  last?: boolean
}) {
  return (
    <View style={last ? S.rowLast : S.row}>
      <Text style={S.label}>{label}</Text>
      <Text style={S.value}>{value || '—'}</Text>
    </View>
  )
}

function VitalCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={S.vitalCell}>
      <Text style={S.vitalLabel}>{label}</Text>
      <Text style={S.vitalValue}>{value}</Text>
    </View>
  )
}
