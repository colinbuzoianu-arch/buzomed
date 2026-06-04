import path from 'path'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import type { ComplianceData } from '@/lib/reports/compliance-data'

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
const RED = '#dc2626'

const S = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: '#1e293b',
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 44,
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
  reportTitle: { fontSize: 13, fontWeight: 700, color: BLUE, marginBottom: 2 },
  companyName: { fontSize: 10, fontWeight: 700 },
  subLine: { fontSize: 7.5, color: MUTED, marginTop: 2 },
  noticeBox: {
    backgroundColor: '#eff6ff',
    border: `1px solid #bfdbfe`,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  noticeTitle: { fontSize: 8, fontWeight: 700, color: BLUE, marginBottom: 3 },
  noticeText: { fontSize: 7.5, color: '#1e40af', lineHeight: 1.5 },
  cards: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  card: {
    flex: 1,
    backgroundColor: LIGHT,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  cardValue: { fontSize: 18, fontWeight: 700, color: BLUE },
  cardLabel: { fontSize: 6.5, color: MUTED, marginTop: 2, textAlign: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  bannerText: { fontSize: 8.5, fontWeight: 700 },
  bannerSub: { fontSize: 7.5, marginTop: 2 },
  sectionTitle: { fontSize: 9, fontWeight: 700, color: BLUE, marginBottom: 6, marginTop: 14 },
  table: { border: `1px solid ${BORDER}`, borderRadius: 4, overflow: 'hidden' },
  tableHead: { flexDirection: 'row', backgroundColor: LIGHT, borderBottom: `1px solid ${BORDER}` },
  tableRow: { flexDirection: 'row', borderBottom: `1px solid ${BORDER}` },
  tableRowLast: { flexDirection: 'row' },
  th: { paddingVertical: 4, paddingHorizontal: 6, fontWeight: 700, color: MUTED, fontSize: 7 },
  td: { paddingVertical: 3, paddingHorizontal: 6, fontSize: 7.5 },
  tdMuted: { paddingVertical: 3, paddingHorizontal: 6, fontSize: 7.5, color: MUTED },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `1px solid ${BORDER}`,
    paddingTop: 5,
  },
  footerText: { fontSize: 6.5, color: MUTED },
  itmBox: {
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  itmTitle: { fontSize: 9, fontWeight: 700, color: BLUE, marginBottom: 6, textAlign: 'center' },
  itmBody: { fontSize: 7.5, lineHeight: 1.6, marginBottom: 8 },
  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  signBlock: { width: '45%', alignItems: 'center' },
  signLine: { borderTop: `1px solid #1e293b`, width: '100%', marginBottom: 4 },
  signLabel: { fontSize: 7, color: MUTED, textAlign: 'center' },
})

const MONTH_NAMES = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const VERDICT_LABELS: Record<string, string> = {
  apt: 'Apt',
  apt_conditionat: 'Apt condiționat',
  inapt_temporar: 'Inapt temporar',
  inapt: 'Inapt',
}

function coverageColor(rate: number | null): string {
  if (rate === null) return MUTED
  if (rate >= 90) return GREEN
  if (rate >= 70) return AMBER
  return RED
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

function fmtPct(rate: number | null): string {
  return rate === null ? '—' : `${rate}%`
}

type Props = { data: ComplianceData }

export function ComplianceReportPdf({ data }: Props) {
  const { company, tenant, year, snapshot, annual, adherence, monthlyTrend, workplaceBreakdown, employeeList } = data

  const coverageRate = snapshot.coverageRate
  const bannerColor = coverageColor(coverageRate)
  const bannerBg = coverageRate === null ? LIGHT : coverageRate >= 90 ? '#f0fdf4' : coverageRate >= 70 ? '#fffbeb' : '#fef2f2'
  const bannerBorder = coverageRate === null ? BORDER : coverageRate >= 90 ? '#bbf7d0' : coverageRate >= 70 ? '#fde68a' : '#fecaca'

  const genDate = fmtDate(data.generatedAt)

  const footer = (
    <View style={S.footer} fixed>
      <Text style={S.footerText}>{tenant.name}</Text>
      <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
      <Text style={S.footerText}>Confidențial — doar uz intern</Text>
    </View>
  )

  const header = (
    <View style={S.header}>
      <View style={S.headerLeft}>
        <Text style={S.reportTitle}>RAPORT DE CONFORMITATE MEDICALĂ</Text>
        <Text style={S.companyName}>{company.name}{company.cui ? ` — CUI: ${company.cui}` : ''}</Text>
        <Text style={S.subLine}>Anul {year} · Generat: {genDate}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={S.cabinetName}>{tenant.name}</Text>
      </View>
    </View>
  )

  // --- Page 1 ---
  const page1 = (
    <Page key="p1" size="A4" style={S.page}>
      {header}

      {/* Official notice */}
      <View style={S.noticeBox}>
        <Text style={S.noticeTitle}>Temei legal</Text>
        <Text style={S.noticeText}>
          Prezentul raport este elaborat în conformitate cu Legea nr. 319/2006 privind securitatea și sănătatea în muncă,
          HG 355/2007 privind supravegherea sănătății lucrătorilor și ordinele Ministerului Sănătății aplicabile.
          Datele conțin informații medicale cu caracter personal și sunt destinate exclusiv persoanelor autorizate.
        </Text>
      </View>

      {/* KPI cards */}
      <View style={S.cards}>
        <View style={S.card}>
          <Text style={S.cardValue}>{snapshot.totalActiveEmployees}</Text>
          <Text style={S.cardLabel}>Angajați activi</Text>
        </View>
        <View style={S.card}>
          <Text style={[S.cardValue, { color: GREEN }]}>{snapshot.employeesWithValidFisa}</Text>
          <Text style={S.cardLabel}>Fișă valabilă</Text>
        </View>
        <View style={S.card}>
          <Text style={[S.cardValue, { color: RED }]}>{snapshot.employeesWithExpiredFisa}</Text>
          <Text style={S.cardLabel}>Fișă expirată</Text>
        </View>
        <View style={S.card}>
          <Text style={[S.cardValue, { color: AMBER }]}>{snapshot.employeesNeverExamined}</Text>
          <Text style={S.cardLabel}>Neexaminați</Text>
        </View>
      </View>

      {/* Coverage banner */}
      <View style={[S.banner, { backgroundColor: bannerBg, border: `1px solid ${bannerBorder}` }]}>
        <View style={{ flex: 1 }}>
          <Text style={[S.bannerText, { color: bannerColor }]}>
            Rată de conformitate: {fmtPct(coverageRate)}
          </Text>
          <Text style={[S.bannerSub, { color: MUTED }]}>
            Expiră în 30 zile: {snapshot.expiringIn30Days} · Expiră în 60 zile: {snapshot.expiringIn60Days}
          </Text>
        </View>
      </View>

      {/* Verdict breakdown */}
      <Text style={S.sectionTitle}>Distribuție verdicte — {year}</Text>
      <View style={S.table}>
        <View style={S.tableHead}>
          <Text style={[S.th, { width: '40%' }]}>Verdict</Text>
          <Text style={[S.th, { width: '30%' }]}>Număr</Text>
          <Text style={[S.th, { width: '30%' }]}>Din total semnat</Text>
        </View>
        {(['apt', 'apt_conditionat', 'inapt_temporar', 'inapt'] as const).map((v, i, arr) => {
          const count = annual.verdictBreakdown[v]
          const pct = annual.signedExaminationsYear > 0
            ? Math.round((count / annual.signedExaminationsYear) * 1000) / 10
            : null
          const isLast = i === arr.length - 1
          return (
            <View key={v} style={isLast ? S.tableRowLast : S.tableRow}>
              <Text style={[S.td, { width: '40%' }]}>{VERDICT_LABELS[v]}</Text>
              <Text style={[S.td, { width: '30%' }]}>{count}</Text>
              <Text style={[S.tdMuted, { width: '30%' }]}>{fmtPct(pct)}</Text>
            </View>
          )
        })}
        <View style={[S.tableRow, { backgroundColor: LIGHT }]}>
          <Text style={[S.td, { width: '40%', fontWeight: 700 }]}>Total examinate semnate</Text>
          <Text style={[S.td, { width: '30%', fontWeight: 700 }]}>{annual.signedExaminationsYear}</Text>
          <Text style={[S.tdMuted, { width: '30%' }]}>din {annual.totalExaminationsYear} totale</Text>
        </View>
      </View>

      {/* Adherence summary */}
      <Text style={S.sectionTitle}>Aderență rechemarilor — {year}</Text>
      <View style={S.table}>
        <View style={S.tableHead}>
          <Text style={[S.th, { width: '55%' }]}>Indicator</Text>
          <Text style={[S.th, { width: '45%' }]}>Valoare</Text>
        </View>
        {[
          ['Total rechemări scadente', String(adherence.totalRecallsDue)],
          ['Rechemări finalizate', String(adherence.recallsCompleted)],
          ['Rechemări restante (snapshot)', String(adherence.recallsOverdue)],
          ['Rată aderență', fmtPct(adherence.adherenceRate)],
          ['Zile medii programat → semnat', annual.avgDaysFromScheduledToSigned !== null ? `${annual.avgDaysFromScheduledToSigned} zile` : '—'],
        ].map(([label, value], i, arr) => (
          <View key={label} style={i === arr.length - 1 ? S.tableRowLast : S.tableRow}>
            <Text style={[S.td, { width: '55%' }]}>{label}</Text>
            <Text style={[S.td, { width: '45%', fontWeight: 700 }]}>{value}</Text>
          </View>
        ))}
      </View>

      {footer}
    </Page>
  )

  // --- Page 2 ---
  const page2 = (
    <Page key="p2" size="A4" style={S.page}>
      {header}

      {/* Monthly trend */}
      <Text style={[S.sectionTitle, { marginTop: 0 }]}>Evoluție lunară — {year}</Text>
      <View style={S.table}>
        <View style={S.tableHead}>
          <Text style={[S.th, { width: '18%' }]}>Lună</Text>
          <Text style={[S.th, { width: '27%' }]}>Examinări finalizate</Text>
          <Text style={[S.th, { width: '27%' }]}>Rechemări scadente</Text>
          <Text style={[S.th, { width: '28%' }]}>Rechemări finalizate</Text>
        </View>
        {monthlyTrend.map((m, i, arr) => (
          <View key={`${m.year}-${m.month}`} style={i === arr.length - 1 ? S.tableRowLast : S.tableRow}>
            <Text style={[S.td, { width: '18%' }]}>{MONTH_NAMES[m.month - 1]} {m.year}</Text>
            <Text style={[S.td, { width: '27%' }]}>{m.examinationsCompleted}</Text>
            <Text style={[S.td, { width: '27%' }]}>{m.recallsDue}</Text>
            <Text style={[S.td, { width: '28%' }]}>{m.recallsCompleted}</Text>
          </View>
        ))}
      </View>

      {/* Workplace breakdown */}
      <Text style={S.sectionTitle}>Situație pe locuri de muncă</Text>
      <View style={S.table}>
        <View style={S.tableHead}>
          <Text style={[S.th, { width: '30%' }]}>Loc de muncă</Text>
          <Text style={[S.th, { width: '14%' }]}>Total</Text>
          <Text style={[S.th, { width: '14%' }]}>Valabili</Text>
          <Text style={[S.th, { width: '14%' }]}>Expirați</Text>
          <Text style={[S.th, { width: '14%' }]}>Neexaminați</Text>
          <Text style={[S.th, { width: '14%' }]}>Conformitate</Text>
        </View>
        {workplaceBreakdown.map((wp, i, arr) => {
          const color = coverageColor(wp.coverageRate)
          return (
            <View key={wp.workplaceId} style={i === arr.length - 1 ? S.tableRowLast : S.tableRow}>
              <Text style={[S.td, { width: '30%' }]}>{wp.workplaceName}</Text>
              <Text style={[S.tdMuted, { width: '14%' }]}>{wp.totalEmployees}</Text>
              <Text style={[S.td, { width: '14%', color: GREEN }]}>{wp.validFisa}</Text>
              <Text style={[S.td, { width: '14%', color: RED }]}>{wp.expired}</Text>
              <Text style={[S.td, { width: '14%', color: AMBER }]}>{wp.neverExamined}</Text>
              <Text style={[S.td, { width: '14%', color, fontWeight: 700 }]}>{fmtPct(wp.coverageRate)}</Text>
            </View>
          )
        })}
        {workplaceBreakdown.length === 0 && (
          <View style={S.tableRowLast}>
            <Text style={[S.tdMuted, { paddingVertical: 8, paddingHorizontal: 6 }]}>Niciun loc de muncă activ.</Text>
          </View>
        )}
      </View>

      {footer}
    </Page>
  )

  // --- Pages 3+: ITM statement + employee list chunked at 30 rows/page ---
  const ROWS_PER_PAGE = 30
  const chunks: typeof employeeList[] = []
  for (let i = 0; i < employeeList.length; i += ROWS_PER_PAGE) {
    chunks.push(employeeList.slice(i, i + ROWS_PER_PAGE))
  }
  if (chunks.length === 0) chunks.push([])

  const STATUS_LABEL: Record<string, string> = {
    valid: 'Valabil',
    expired: 'Expirat',
    never_examined: 'Neexaminat',
  }

  const employeePages = chunks.map((chunk, chunkIdx) => (
    <Page key={`emp-${chunkIdx}`} size="A4" style={S.page}>
      {header}

      {chunkIdx === 0 && (
        <View style={S.itmBox}>
          <Text style={S.itmTitle}>DECLARAȚIE PRIVIND SUPRAVEGHEREA SĂNĂTĂȚII LUCRĂTORILOR</Text>
          <Text style={S.itmBody}>
            Subsemnatul/a, reprezentant legal al cabinetului de medicină a muncii {tenant.name}, certific că prezentul
            raport reflectă situația reală a supravegherii medicale a lucrătorilor companiei {company.name}
            {company.cui ? ` (CUI: ${company.cui})` : ''} pentru anul {year}.
            Examinările medicale au fost efectuate în conformitate cu prevederile HG 355/2007 și ale fișelor de solicitare
            transmise de angajator. Informațiile sunt furnizate în scopul controlului ITM și nu conțin date clinice confidențiale.
          </Text>
          <View style={S.signRow}>
            <View style={S.signBlock}>
              <View style={S.signLine} />
              <Text style={S.signLabel}>Medic de medicină a muncii / Ștampilă cabinet</Text>
            </View>
            <View style={S.signBlock}>
              <View style={S.signLine} />
              <Text style={S.signLabel}>Reprezentant angajator / Ștampilă companie</Text>
            </View>
          </View>
        </View>
      )}

      <Text style={[S.sectionTitle, { marginTop: chunkIdx === 0 ? 0 : 0 }]}>
        Listă angajați — situație conformitate (pagina {chunkIdx + 1}/{chunks.length})
      </Text>
      <View style={S.table}>
        <View style={S.tableHead}>
          <Text style={[S.th, { width: '24%' }]}>Angajat</Text>
          <Text style={[S.th, { width: '20%' }]}>Funcție</Text>
          <Text style={[S.th, { width: '20%' }]}>Loc de muncă</Text>
          <Text style={[S.th, { width: '14%' }]}>Ultima fișă</Text>
          <Text style={[S.th, { width: '12%' }]}>Verdict</Text>
          <Text style={[S.th, { width: '10%' }]}>Scadență</Text>
        </View>
        {chunk.map((emp, i, arr) => {
          const statusColor = emp.status === 'valid' ? GREEN : emp.status === 'expired' ? RED : AMBER
          return (
            <View key={emp.id} style={i === arr.length - 1 ? S.tableRowLast : S.tableRow}>
              <Text style={[S.td, { width: '24%' }]}>{emp.lastName} {emp.firstName}</Text>
              <Text style={[S.tdMuted, { width: '20%' }]}>{emp.jobTitle ?? '—'}</Text>
              <Text style={[S.tdMuted, { width: '20%' }]}>{emp.workplaceName ?? '—'}</Text>
              <Text style={[S.tdMuted, { width: '14%' }]}>{fmtDate(emp.lastExamDate)}</Text>
              <Text style={[S.tdMuted, { width: '12%' }]}>{emp.lastVerdict ? (VERDICT_LABELS[emp.lastVerdict] ?? emp.lastVerdict) : '—'}</Text>
              <Text style={[S.td, { width: '10%', color: statusColor, fontWeight: 700 }]}>{STATUS_LABEL[emp.status] ?? emp.status}</Text>
            </View>
          )
        })}
        {chunk.length === 0 && (
          <View style={S.tableRowLast}>
            <Text style={[S.tdMuted, { paddingVertical: 8, paddingHorizontal: 6 }]}>Niciun angajat activ.</Text>
          </View>
        )}
      </View>

      {footer}
    </Page>
  ))

  return (
    <Document>
      {page1}
      {page2}
      {employeePages}
    </Document>
  )
}
