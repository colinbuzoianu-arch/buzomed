import { Skeleton } from '@/components/ui/skeleton'

const DONUTS = ['c1', 'c2', 'c3']
const DONUT_LEGEND = ['l1', 'l2', 'l3', 'l4']
const BARS = ['b1', 'b2']
const ALERT_ROWS = ['a1', 'a2', 'a3']
const TABLE_ROWS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8']

export default function HrDashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-9 w-40 rounded-md" />
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>

      {/* Three donuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DONUTS.map((d) => (
          <div key={d} className="rounded-lg border p-4 flex items-center gap-4">
            <Skeleton className="h-[140px] w-[140px] rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              {DONUT_LEGEND.map((l) => (
                <Skeleton key={`${d}-${l}`} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Two bar charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {BARS.map((b) => (
          <div key={b} className="rounded-lg border p-4 space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        ))}
      </div>

      {/* Alerts */}
      <div className="rounded-lg border p-4 space-y-2">
        <Skeleton className="h-4 w-24" />
        {ALERT_ROWS.map((a) => (
          <Skeleton key={a} className="h-9 w-full" />
        ))}
      </div>

      {/* Table */}
      <div className="border rounded-lg divide-y">
        {TABLE_ROWS.map((t) => (
          <div key={t} className="px-4 py-3 flex items-center gap-4">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-4 w-24 hidden sm:block" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
