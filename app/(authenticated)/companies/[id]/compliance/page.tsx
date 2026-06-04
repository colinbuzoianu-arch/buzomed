import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { computeComplianceData } from '@/lib/reports/compliance-data'
import { prisma } from '@/lib/prisma'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { YearSelector, WorkplaceTable, EmployeeList } from './compliance-client'
import { ItmBriefingButton } from './itm-briefing-button'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ year?: string }>
}

const VERDICT_LABELS: Record<string, string> = {
  apt: 'Apt',
  apt_conditionat: 'Apt condiționat',
  inapt_temporar: 'Inapt temporar',
  inapt: 'Inapt',
}

function coverageClass(rate: number | null) {
  if (rate === null) return 'text-muted-foreground'
  if (rate >= 90) return 'text-green-600 font-semibold'
  if (rate >= 70) return 'text-amber-600 font-semibold'
  return 'text-red-600 font-semibold'
}

function fmtPct(rate: number | null) {
  return rate === null ? '—' : `${rate}%`
}

export default async function CompliancePage({ params, searchParams }: PageProps) {
  const user = await requireUser()
  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const hasReportingRole = user.roles.some((r) => r === 'practitioner' || r === 'practice_admin')
  if (!hasReportingRole) redirect('/')

  const { id } = await params
  const sp = await searchParams
  const year = sp.year ? parseInt(sp.year, 10) : new Date().getFullYear()

  const company = await prisma.company.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    select: { id: true, name: true, cui: true },
  })
  if (!company) notFound()

  const data = await computeComplianceData({ companyId: id, tenantId: user.tenantId, year })
  if (!data) notFound()

  const { snapshot, annual, adherence, monthlyTrend, workplaceBreakdown, employeeList, forecast } = data

  const MONTH_NAMES = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Companii', href: '/companies' },
          { label: company.name, href: `/companies/${company.id}` },
          { label: 'Raport Conformitate' },
        ]}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Raport de Conformitate Medicală</h1>
          <h2 className="text-lg font-semibold text-muted-foreground mt-0.5">{company.name}</h2>
          {company.cui && <p className="text-sm text-muted-foreground">CUI: {company.cui}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <YearSelector companyId={company.id} year={year} />
          <a
            href={`/api/reports/company/${company.id}/compliance-pdf?year=${year}`}
            download
            className="text-sm border rounded-md px-3 py-1 hover:bg-muted whitespace-nowrap"
          >
            ↓ PDF ITM
          </a>
        </div>
      </div>

      {/* ITM briefing */}
      <ItmBriefingButton companyId={company.id} year={year} />

      {/* Coverage banner */}
      <div className={`rounded-lg border p-4 ${
        snapshot.coverageRate === null ? 'bg-muted/30' :
        snapshot.coverageRate >= 90 ? 'bg-green-50 border-green-200' :
        snapshot.coverageRate >= 70 ? 'bg-amber-50 border-amber-200' :
        'bg-red-50 border-red-200'
      }`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className={`text-xl font-bold ${coverageClass(snapshot.coverageRate)}`}>
              Rată de conformitate: {fmtPct(snapshot.coverageRate)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Expiră în 30 de zile: <span className="font-medium text-amber-600">{snapshot.expiringIn30Days}</span>
              {' '}· Expiră în 60 de zile: <span className="font-medium text-amber-500">{snapshot.expiringIn60Days}</span>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">Snapshot la {new Date().toLocaleDateString('ro-RO')}</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="border rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-blue-900">{snapshot.totalActiveEmployees}</p>
          <p className="text-xs text-muted-foreground mt-1">Angajați activi</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{snapshot.employeesWithValidFisa}</p>
          <p className="text-xs text-muted-foreground mt-1">Fișă valabilă</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-red-600">{snapshot.employeesWithExpiredFisa}</p>
          <p className="text-xs text-muted-foreground mt-1">Fișă expirată</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-amber-600">{snapshot.employeesNeverExamined}</p>
          <p className="text-xs text-muted-foreground mt-1">Neexaminați</p>
        </div>
      </div>

      {/* Compliance forecast */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Previziune conformitate — scenariul fără reînnoiri</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'În 30 zile', d: forecast.in30Days },
            { label: 'În 60 zile', d: forecast.in60Days },
            { label: 'În 90 zile', d: forecast.in90Days },
          ].map(({ label, d }) => (
            <div key={label} className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
              <p className={`text-2xl font-bold ${coverageClass(d.projectedRate)}`}>
                {fmtPct(d.projectedRate)}
              </p>
              <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                <p>Expiră: <span className="font-medium text-amber-600">{d.expiringCount}</span></p>
                <p>Rechemări: <span className="font-medium">{d.recallsDue}</span></p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Proiecție pesimistă — presupune că nicio examinare nu este reînnoită înainte de expirare.
        </p>
      </div>

      {/* Verdict + Adherence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Verdict breakdown */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Distribuție verdicte — {year}</h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Verdict</th>
                  <th className="text-right px-4 py-2">Nr.</th>
                  <th className="text-right px-4 py-2">%</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(['apt', 'apt_conditionat', 'inapt_temporar', 'inapt'] as const).map((v) => {
                  const count = annual.verdictBreakdown[v]
                  const pct = annual.signedExaminationsYear > 0
                    ? Math.round((count / annual.signedExaminationsYear) * 1000) / 10
                    : null
                  return (
                    <tr key={v}>
                      <td className="px-4 py-2">{VERDICT_LABELS[v]}</td>
                      <td className="px-4 py-2 text-right font-medium">{count}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{fmtPct(pct)}</td>
                    </tr>
                  )
                })}
                <tr className="bg-muted/20 font-semibold">
                  <td className="px-4 py-2">Total semnat</td>
                  <td className="px-4 py-2 text-right">{annual.signedExaminationsYear}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">din {annual.totalExaminationsYear}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {annual.avgDaysFromScheduledToSigned !== null && (
            <p className="text-xs text-muted-foreground mt-2">
              Medie zile de la programat la semnat: <span className="font-medium">{annual.avgDaysFromScheduledToSigned}</span>
            </p>
          )}
        </div>

        {/* Adherence */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Aderență rechemări — {year}</h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Indicator</th>
                  <th className="text-right px-4 py-2">Valoare</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  ['Rechemări scadente în an', adherence.totalRecallsDue],
                  ['Finalizate', adherence.recallsCompleted],
                  ['Restante (snapshot curent)', adherence.recallsOverdue],
                ].map(([label, val]) => (
                  <tr key={String(label)}>
                    <td className="px-4 py-2">{label}</td>
                    <td className="px-4 py-2 text-right font-medium">{val}</td>
                  </tr>
                ))}
                <tr className="bg-muted/20">
                  <td className="px-4 py-2 font-semibold">Rată aderență</td>
                  <td className={`px-4 py-2 text-right font-bold ${coverageClass(adherence.adherenceRate)}`}>
                    {fmtPct(adherence.adherenceRate)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Monthly trend */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Evoluție lunară — {year}</h3>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Lună</th>
                <th className="text-right px-4 py-2">Examinări</th>
                <th className="text-right px-4 py-2">Rechemări scadente</th>
                <th className="text-right px-4 py-2">Rechemări finalizate</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {monthlyTrend.map((m) => (
                <tr key={`${m.year}-${m.month}`}>
                  <td className="px-4 py-2">{MONTH_NAMES[m.month - 1]} {m.year}</td>
                  <td className="px-4 py-2 text-right">{m.examinationsCompleted}</td>
                  <td className="px-4 py-2 text-right">{m.recallsDue}</td>
                  <td className="px-4 py-2 text-right">{m.recallsCompleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Workplace breakdown */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Situație pe locuri de muncă</h3>
        <WorkplaceTable workplaceBreakdown={workplaceBreakdown} />
      </div>

      {/* Employee list */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Listă angajați</h3>
        <EmployeeList employeeList={employeeList} />
      </div>
    </div>
  )
}
