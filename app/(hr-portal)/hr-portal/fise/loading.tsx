import { Skeleton } from '@/components/ui/skeleton'

const FILTERS = ['f1', 'f2', 'f3', 'f4']
const ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']

export default function HrFiseLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="flex gap-3">
        {FILTERS.map((f) => (
          <Skeleton key={f} className="h-9 w-36 rounded-md" />
        ))}
      </div>
      <div className="border rounded-lg divide-y">
        {ROWS.map((r) => (
          <div key={r} className="px-4 py-3 flex items-center gap-4">
            <Skeleton className="h-4 w-4" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-4 w-20 hidden sm:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
