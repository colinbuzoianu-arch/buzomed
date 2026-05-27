import path from 'path'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'

Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf'), fontWeight: 400 },
    { src: path.join(process.cwd(), 'public', 'fonts', 'Inter-Bold.ttf'), fontWeight: 700 },
  ],
})

const BLUE = '#1e3a8a'
const LIGHT = '#f1f5f9'
const BORDER = '#e2e8f0'
const MUTED = '#64748b'
const GREEN = '#16a34a'
const AMBER = '#d97706'

const S = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: '#1e293b',
    paddingHorizontal: 32,
    paddingVertical: 28,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: `2px solid ${BLUE}`,
    paddingBottom: 8,
    marginBottom: 14,
  },
  headerLeft: { flex: 1 },
  cabinetName: { fontSize: 10, fontWeight: 700, color: BLUE },
  reportTitle: { fontSize: 14, fontWeight: 700, color: BLUE, marginBottom: 2 },
  companyName: { fontSize: 11, fontWeight: 700 },
  dateRange: { fontSize: 8, color: MUTED, marginTop: 2 },
  cards: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  card: {
    flex: 1,
    backgroundColor: LIGHT,
    borderRadius: 4,
    padding: 10,
    alignItems: 'center',
  },
  cardValue: { fontSize: 20, fontWeight: 700, color: BLUE },
  cardLabel: { fontSize: 7, color: MUTED, marginTop: 2, textAlign: 'center' },
  table: { border: `1px solid ${BORDER}`, borderRadius: 4, overflow: 'hidden' },
  tableHead: { flexDirection: 'row', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` },
  tableRow: { flexDirection: 'row', borderBottom: `1px solid ${BORDER}` },
  tableRowLast: { flexDirection: 'row' },
  thName: { width: '22%', padding: '5 6', fontWeight: 700, color: MUTED, fontSize: 7 },
  thJob: { width: '18%', padding: '5 6', fontWeight: 700, color: MUTED, fontSize: 7 },
  thWorkplace: { width: '18%', padding: '5 6', fontWeight: 700, color: MUTED, fontSize: 7 },
  thExam: { width: '14%', padding: '5 6', fontWeight: 700, color: MUTED, fontSize: 7 },
  thVerdict: { width: '14%', padding: '5 6', fontWeight: 700, color: MUTED, fontSize: 7 },
  thDue: { width: '14%', padding: '5 6', fontWeight: 700, color: MUTED, fontSize: 7 },
  tdName: { width: '22%', padding: '4 6' },
  tdJob: { width: '18%', padding: '4 6', color: MUTED },
  tdWorkplace: { width: '18%', padding: '4 6', color: MUTED },
  tdExam: { width: '14%', padding: '4 6', color: MUTED },
  tdVerdict: { width: '14%', padding: '4 6' },
  tdDue: { width: '14%', padding: '4 6', color: MUTED },
  verdictFit: { color: GREEN },
  verdictRestricted: { color: AMBER },
  verdictUnfit: { color: '#dc2626' },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `1px solid ${BORDER}`,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: MUTED },
  sectionTitle: { fontSize: 9, fontWeight: 700, color: BLUE, marginBottom: 6 },
})

type WorkerRow = {
  name: string
  jobTitle: string
  workplace: string
  lastExamDate: string
  verdict: string | null
  nextDue: string
}

type Props = {
  cabinetName: string
  companyName: string
  fromDate: string
  toDate: string
  totalEmployees: number
  totalExaminations: number
  totalFit: number
  totalRestricted: number
  workers: WorkerRow[]
  generatedAt: string
}

const VERDICT_LABELS: Record<string, string> = {
  apt: 'Apt',
  apt_conditionat: 'Apt condiționat',
  inapt_temporar: 'Inapt temporar',
  inapt: 'Inapt',
}

function verdictStyle(verdict: string | null) {
  if (verdict === 'apt') return S.verdictFit
  if (verdict === 'apt_conditionat') return S.verdictRestricted
  if (verdict) return S.verdictUnfit
  return undefined
}

export function CompanyReportPdfDocument(props: Props) {
  const { cabinetName, companyName, fromDate, toDate, totalEmployees, totalExaminations, totalFit, totalRestricted, workers, generatedAt } = props

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <View style={S.headerLeft}>
            <Text style={S.reportTitle}>RAPORT MEDICAL</Text>
            <Text style={S.companyName}>{companyName}</Text>
            <Text style={S.dateRange}>Interval: {fromDate} — {toDate}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={S.cabinetName}>{cabinetName}</Text>
          </View>
        </View>

        {/* Summary cards */}
        <View style={S.cards}>
          <View style={S.card}>
            <Text style={S.cardValue}>{totalEmployees}</Text>
            <Text style={S.cardLabel}>Angajați</Text>
          </View>
          <View style={S.card}>
            <Text style={S.cardValue}>{totalExaminations}</Text>
            <Text style={S.cardLabel}>Examinări</Text>
          </View>
          <View style={S.card}>
            <Text style={S.cardValue}>{totalFit}</Text>
            <Text style={S.cardLabel}>Apți</Text>
          </View>
          <View style={S.card}>
            <Text style={S.cardValue}>{totalRestricted}</Text>
            <Text style={S.cardLabel}>Cu restricții / Inapți</Text>
          </View>
        </View>

        {/* Workers table */}
        <Text style={S.sectionTitle}>Situație angajați</Text>
        <View style={S.table}>
          <View style={S.tableHead}>
            <Text style={S.thName}>Angajat</Text>
            <Text style={S.thJob}>Funcție</Text>
            <Text style={S.thWorkplace}>Loc de muncă</Text>
            <Text style={S.thExam}>Ultima examinare</Text>
            <Text style={S.thVerdict}>Verdict</Text>
            <Text style={S.thDue}>Scadență</Text>
          </View>
          {workers.map((w, i) => (
            <View key={i} style={i === workers.length - 1 ? S.tableRowLast : S.tableRow}>
              <Text style={S.tdName}>{w.name}</Text>
              <Text style={S.tdJob}>{w.jobTitle}</Text>
              <Text style={S.tdWorkplace}>{w.workplace}</Text>
              <Text style={S.tdExam}>{w.lastExamDate}</Text>
              <Text style={verdictStyle(w.verdict) ? [S.tdVerdict, verdictStyle(w.verdict)!] : S.tdVerdict}>
                {w.verdict ? (VERDICT_LABELS[w.verdict] ?? w.verdict) : '—'}
              </Text>
              <Text style={S.tdDue}>{w.nextDue}</Text>
            </View>
          ))}
          {workers.length === 0 && (
            <View style={S.tableRowLast}>
              <Text style={{ padding: '8 6', color: MUTED }}>Nicio examinare în intervalul selectat.</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{cabinetName}</Text>
          <Text style={S.footerText}>Generat: {generatedAt}</Text>
        </View>
      </Page>
    </Document>
  )
}
