import path from 'path'
import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer'

// Inter cu fișiere locale — evită dependența de rețea la render time.
// Helvetica (built-in) este Latin-1 și nu afișează diacritice românești.
Font.register({
  family: 'Inter',
  fonts: [
    {
      src: path.join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf'),
      fontWeight: 400,
    },
    {
      src: path.join(process.cwd(), 'public', 'fonts', 'Inter-Bold.ttf'),
      fontWeight: 700,
    },
  ],
})

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 9,
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 40,
    color: '#0f1e3f',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  cabinetName: { fontSize: 13, fontWeight: 700, color: '#0f1e3f' },
  cabinetDetail: { fontSize: 8, color: '#64748b', marginTop: 2 },
  titleBlock: { marginBottom: 20, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  titleLabel: { fontSize: 16, fontWeight: 700, letterSpacing: -0.3 },
  titleNumber: { fontSize: 16, fontWeight: 700, color: '#1E4D8B' },
  metaRow: { flexDirection: 'row', gap: 20, marginBottom: 6 },
  metaItem: { flexDirection: 'row', gap: 4 },
  metaLabel: { color: '#64748b' },
  partiesRow: { flexDirection: 'row', gap: 20, marginBottom: 20 },
  party: { flex: 1, backgroundColor: '#f8fafc', padding: 10, borderRadius: 4 },
  partyLabel: { fontSize: 7, fontWeight: 700, color: '#64748b', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  partyName: { fontSize: 10, fontWeight: 700, marginBottom: 3 },
  partyDetail: { color: '#475569', marginBottom: 1 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f1f5f9', padding: '6 8', marginBottom: 0 },
  tableHeaderCell: { fontSize: 7, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', padding: '7 8', borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  tableCell: { fontSize: 9 },
  colDesc: { flex: 1 },
  colQty: { width: 40, textAlign: 'right' },
  colPrice: { width: 60, textAlign: 'right' },
  colTotal: { width: 60, textAlign: 'right', fontWeight: 700 },
  totalsBlock: { alignItems: 'flex-end', marginTop: 14 },
  totalsInner: { width: 200 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  totalLabel: { color: '#64748b' },
  totalValue: { fontWeight: 700 },
  totalGrandRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, marginTop: 2 },
  totalGrandLabel: { fontSize: 10, fontWeight: 700 },
  totalGrandValue: { fontSize: 10, fontWeight: 700, color: '#0f1e3f' },
  vatNotice: { marginTop: 14, fontSize: 7.5, color: '#64748b', backgroundColor: '#f8fafc', padding: '6 8', borderRadius: 4 },
  notesSection: { marginTop: 14 },
  notesLabel: { fontSize: 7, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  notesText: { fontSize: 8.5, color: '#475569', lineHeight: 1.5 },
  watermark: { position: 'absolute', top: '40%', left: '15%', fontSize: 72, fontWeight: 700, color: '#fee2e2', opacity: 0.6, transform: 'rotate(-35deg)', letterSpacing: 4 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#e2e8f0', paddingTop: 6 },
  footerText: { fontSize: 7, color: '#94a3b8' },
})

function fmt(val: number | string | { toString(): string }): string {
  return Number(val).toFixed(2)
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = d instanceof Date ? d : new Date(d)
  return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

export type InvoicePdfData = {
  invoiceNumber: string
  status: string
  issuedAt: Date | null
  dueDate: Date | null
  paidAt: Date | null
  subtotal: string | number
  vatRate: string | number
  vatAmount: string | number
  total: string | number
  currency: string
  vatExemptReason: string | null
  notes: string | null
  items: Array<{
    description: string
    quantity: string | number
    unitPrice: string | number
    lineTotal: string | number
  }>
  tenant: {
    name: string
    cui: string | null
    address: string | null
    phone: string | null
    email: string | null
  }
  company: {
    name: string
    cui: string | null
    address: string | null
    city: string | null
    contactPersonName: string | null
    contactPersonEmail: string | null
  }
}

export function InvoicePdfDocument({ data }: { data: InvoicePdfData }) {
  const isVatExempt = Number(data.vatRate) === 0
  const isCancelled = data.status === 'cancelled'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {isCancelled && (
          <Text style={styles.watermark}>ANULATĂ</Text>
        )}

        <View style={styles.header}>
          <View>
            <Text style={styles.cabinetName}>{data.tenant.name}</Text>
            {data.tenant.cui && <Text style={styles.cabinetDetail}>CUI: {data.tenant.cui}</Text>}
            {data.tenant.address && <Text style={styles.cabinetDetail}>{data.tenant.address}</Text>}
            {data.tenant.phone && <Text style={styles.cabinetDetail}>{data.tenant.phone}</Text>}
            {data.tenant.email && <Text style={styles.cabinetDetail}>{data.tenant.email}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 7, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Document fiscal</Text>
            <Text style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>Buzomed · medicina muncii</Text>
          </View>
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.titleLabel}>FACTURĂ FISCALĂ</Text>
            <Text style={styles.titleNumber}>{data.invoiceNumber}</Text>
          </View>
          <View style={[styles.metaRow, { marginTop: 8 }]}>
            {data.issuedAt && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Data emiterii:</Text>
                <Text> {fmtDate(data.issuedAt)}</Text>
              </View>
            )}
            {data.dueDate && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Scadența:</Text>
                <Text> {fmtDate(data.dueDate)}</Text>
              </View>
            )}
            {data.paidAt && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Plătită:</Text>
                <Text> {fmtDate(data.paidAt)}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Furnizor</Text>
            <Text style={styles.partyName}>{data.tenant.name}</Text>
            {data.tenant.cui && <Text style={styles.partyDetail}>CUI: {data.tenant.cui}</Text>}
            {data.tenant.address && <Text style={styles.partyDetail}>{data.tenant.address}</Text>}
          </View>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Beneficiar</Text>
            <Text style={styles.partyName}>{data.company.name}</Text>
            {data.company.cui && <Text style={styles.partyDetail}>CUI: {data.company.cui}</Text>}
            {data.company.address && <Text style={styles.partyDetail}>{data.company.address}</Text>}
            {data.company.city && <Text style={styles.partyDetail}>{data.company.city}</Text>}
            {data.company.contactPersonName && (
              <Text style={[styles.partyDetail, { marginTop: 4 }]}>
                Attn: {data.company.contactPersonName}
              </Text>
            )}
          </View>
        </View>

        <View style={{ borderWidth: 0.5, borderColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Descriere</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Cant.</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>Preț ({data.currency})</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total ({data.currency})</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.colDesc]}>{item.description}</Text>
              <Text style={[styles.tableCell, styles.colQty]}>{fmt(item.quantity)}</Text>
              <Text style={[styles.tableCell, styles.colPrice]}>{fmt(item.unitPrice)}</Text>
              <Text style={[styles.tableCell, styles.colTotal]}>{fmt(item.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsInner}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{fmt(data.subtotal)} {data.currency}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {isVatExempt ? 'TVA (scutit Art. 292)' : `TVA ${(Number(data.vatRate) * 100).toFixed(0)}%`}
              </Text>
              <Text style={styles.totalValue}>{fmt(data.vatAmount)} {data.currency}</Text>
            </View>
            <View style={styles.totalGrandRow}>
              <Text style={styles.totalGrandLabel}>Total de plată</Text>
              <Text style={styles.totalGrandValue}>{fmt(data.total)} {data.currency}</Text>
            </View>
          </View>
        </View>

        {isVatExempt && data.vatExemptReason && (
          <Text style={styles.vatNotice}>{data.vatExemptReason}</Text>
        )}

        {data.notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Note / Mențiuni</Text>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {data.invoiceNumber} · {data.tenant.name}
          </Text>
          <Text style={styles.footerText}>
            Document generat de Buzomed
          </Text>
        </View>
      </Page>
    </Document>
  )
}
