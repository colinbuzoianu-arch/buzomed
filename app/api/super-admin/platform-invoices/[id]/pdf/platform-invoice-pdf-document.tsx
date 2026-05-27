import path from 'path'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import { getPlatformIssuer } from '@/lib/platform/issuer'

Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf'), fontWeight: 400 },
    { src: path.join(process.cwd(), 'public', 'fonts', 'Inter-Bold.ttf'), fontWeight: 700 },
  ],
})

const S = StyleSheet.create({
  page:         { fontFamily: 'Inter', fontSize: 9, paddingTop: 40, paddingBottom: 60, paddingHorizontal: 40, color: '#0f1e3f' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  issuerName:   { fontSize: 13, fontWeight: 700 },
  issuerDetail: { fontSize: 8, color: '#64748b', marginTop: 2 },
  docMeta:      { alignItems: 'flex-end' },
  titleRow:     { flexDirection: 'row', gap: 10, alignItems: 'baseline', marginBottom: 4 },
  titleLabel:   { fontSize: 16, fontWeight: 700 },
  titleNumber:  { fontSize: 16, fontWeight: 700, color: '#1E4D8B' },
  metaRow:      { flexDirection: 'row', gap: 16, marginBottom: 16, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingBottom: 12 },
  metaLabel:    { color: '#64748b' },
  partiesRow:   { flexDirection: 'row', gap: 16, marginBottom: 20 },
  party:        { flex: 1, backgroundColor: '#f8fafc', padding: 10, borderRadius: 4 },
  partyLabel:   { fontSize: 7, fontWeight: 700, color: '#64748b', letterSpacing: 0.8, marginBottom: 6 },
  partyName:    { fontSize: 10, fontWeight: 700, marginBottom: 3 },
  partyDetail:  { color: '#475569', marginBottom: 1, fontSize: 8.5 },
  tableWrap:    { borderWidth: 0.5, borderColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 16 },
  tableHead:    { flexDirection: 'row', backgroundColor: '#f1f5f9', padding: '6 8' },
  tableHeadCell:{ fontSize: 7, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 },
  tableRow:     { flexDirection: 'row', padding: '7 8', borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  colDesc:      { flex: 1 },
  colQty:       { width: 40, textAlign: 'right' },
  colPrice:     { width: 64, textAlign: 'right' },
  colTotal:     { width: 64, textAlign: 'right', fontWeight: 700 },
  totalsBlock:  { alignItems: 'flex-end', marginBottom: 20 },
  totalsInner:  { width: 200 },
  totalRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  totalLabel:   { color: '#64748b' },
  totalValue:   { fontWeight: 700 },
  grandRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  grandLabel:   { fontSize: 10, fontWeight: 700 },
  grandValue:   { fontSize: 10, fontWeight: 700 },
  bankBlock:    { backgroundColor: '#f8fafc', padding: '8 10', borderRadius: 4, marginBottom: 12 },
  bankLabel:    { fontSize: 7, fontWeight: 700, color: '#64748b', letterSpacing: 0.5, marginBottom: 4 },
  bankRow:      { flexDirection: 'row', gap: 8, marginBottom: 2 },
  bankKey:      { fontSize: 8, color: '#64748b', width: 60 },
  bankVal:      { fontSize: 8, fontWeight: 700 },
  vatNotice:    { fontSize: 7.5, color: '#64748b', backgroundColor: '#f8fafc', padding: '5 8', borderRadius: 3, marginBottom: 8 },
  notes:        { fontSize: 8.5, color: '#475569', lineHeight: 1.5, marginBottom: 12 },
  watermark:    { position: 'absolute', top: '40%', left: '15%', fontSize: 72, fontWeight: 700, color: '#fee2e2', opacity: 0.5, transform: 'rotate(-35deg)', letterSpacing: 4 },
  footer:       { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#e2e8f0', paddingTop: 6 },
  footerText:   { fontSize: 7, color: '#94a3b8' },
})

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d))
}
function fmt(v: string | number): string { return Number(v).toFixed(2) }

export type PlatformInvoicePdfData = {
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
    email: string | null
  }
}

export function PlatformInvoicePdfDocument({ data }: { data: PlatformInvoicePdfData }) {
  const issuer = getPlatformIssuer()
  const isVatExempt = Number(data.vatRate) === 0
  const isCancelled = data.status === 'cancelled'

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {isCancelled && <Text style={S.watermark}>ANULATĂ</Text>}

        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.issuerName}>{issuer.name}</Text>
            {issuer.cui     && <Text style={S.issuerDetail}>CUI: {issuer.cui}</Text>}
            {issuer.regNo   && <Text style={S.issuerDetail}>Reg. Com.: {issuer.regNo}</Text>}
            {issuer.address && <Text style={S.issuerDetail}>{issuer.address}</Text>}
            {issuer.city    && <Text style={S.issuerDetail}>{issuer.city}{issuer.county ? `, ${issuer.county}` : ''}</Text>}
            {issuer.phone   && <Text style={S.issuerDetail}>{issuer.phone}</Text>}
            {issuer.email   && <Text style={S.issuerDetail}>{issuer.email}</Text>}
          </View>
          <View style={S.docMeta}>
            <Text style={{ fontSize: 7, color: '#94a3b8' }}>Factură platformă</Text>
            <Text style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>Buzomed · verumsell.com</Text>
          </View>
        </View>

        {/* Title + meta */}
        <View style={{ borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingBottom: 14, marginBottom: 16 }}>
          <View style={S.titleRow}>
            <Text style={S.titleLabel}>FACTURĂ FISCALĂ</Text>
            <Text style={S.titleNumber}>{data.invoiceNumber}</Text>
          </View>
          <View style={S.metaRow}>
            {data.issuedAt && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Text style={S.metaLabel}>Data emiterii:</Text>
                <Text>{fmtDate(data.issuedAt)}</Text>
              </View>
            )}
            {data.dueDate && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Text style={S.metaLabel}>Scadență:</Text>
                <Text>{fmtDate(data.dueDate)}</Text>
              </View>
            )}
            {data.paidAt && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Text style={S.metaLabel}>Plătită:</Text>
                <Text>{fmtDate(data.paidAt)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Parties */}
        <View style={S.partiesRow}>
          <View style={S.party}>
            <Text style={S.partyLabel}>FURNIZOR</Text>
            <Text style={S.partyName}>{issuer.name}</Text>
            {issuer.cui     && <Text style={S.partyDetail}>CUI: {issuer.cui}</Text>}
            {issuer.address && <Text style={S.partyDetail}>{issuer.address}</Text>}
            {issuer.city    && <Text style={S.partyDetail}>{issuer.city}</Text>}
          </View>
          <View style={S.party}>
            <Text style={S.partyLabel}>BENEFICIAR</Text>
            <Text style={S.partyName}>{data.tenant.name}</Text>
            {data.tenant.cui     && <Text style={S.partyDetail}>CUI: {data.tenant.cui}</Text>}
            {data.tenant.address && <Text style={S.partyDetail}>{data.tenant.address}</Text>}
            {data.tenant.email   && <Text style={S.partyDetail}>{data.tenant.email}</Text>}
          </View>
        </View>

        {/* Table */}
        <View style={S.tableWrap}>
          <View style={S.tableHead}>
            <Text style={[S.tableHeadCell, S.colDesc]}>Descriere serviciu</Text>
            <Text style={[S.tableHeadCell, S.colQty]}>Cant.</Text>
            <Text style={[S.tableHeadCell, S.colPrice]}>Pret ({data.currency})</Text>
            <Text style={[S.tableHeadCell, S.colTotal]}>Total ({data.currency})</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={S.tableRow}>
              <Text style={[{ fontSize: 9 }, S.colDesc]}>{item.description}</Text>
              <Text style={[{ fontSize: 9 }, S.colQty]}>{fmt(item.quantity)}</Text>
              <Text style={[{ fontSize: 9 }, S.colPrice]}>{fmt(item.unitPrice)}</Text>
              <Text style={[{ fontSize: 9 }, S.colTotal]}>{fmt(item.lineTotal)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={S.totalsBlock}>
          <View style={S.totalsInner}>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>Subtotal</Text>
              <Text style={S.totalValue}>{fmt(data.subtotal)} {data.currency}</Text>
            </View>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>
                {isVatExempt ? 'TVA (scutit de taxă)' : `TVA ${(Number(data.vatRate) * 100).toFixed(0)}%`}
              </Text>
              <Text style={S.totalValue}>{fmt(data.vatAmount)} {data.currency}</Text>
            </View>
            <View style={S.grandRow}>
              <Text style={S.grandLabel}>Total de plată</Text>
              <Text style={S.grandValue}>{fmt(data.total)} {data.currency}</Text>
            </View>
          </View>
        </View>

        {/* Bank details */}
        {(issuer.bank || issuer.iban) && (
          <View style={S.bankBlock}>
            <Text style={S.bankLabel}>DATE BANCARE</Text>
            {issuer.bank && (
              <View style={S.bankRow}>
                <Text style={S.bankKey}>Bancă:</Text>
                <Text style={S.bankVal}>{issuer.bank}</Text>
              </View>
            )}
            {issuer.iban && (
              <View style={S.bankRow}>
                <Text style={S.bankKey}>IBAN:</Text>
                <Text style={S.bankVal}>{issuer.iban}</Text>
              </View>
            )}
          </View>
        )}

        {/* VAT notice */}
        {isVatExempt && data.vatExemptReason && (
          <Text style={S.vatNotice}>{data.vatExemptReason}</Text>
        )}

        {/* Notes */}
        {data.notes && <Text style={S.notes}>{data.notes}</Text>}

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{data.invoiceNumber} · {issuer.name}</Text>
          <Text style={S.footerText}>Buzomed · verumsell.com</Text>
        </View>
      </Page>
    </Document>
  )
}
