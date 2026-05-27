import { Skeleton } from '@/components/ui/skeleton'

export default function HazardsReportLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="flex gap-2">
        {[100, 90, 80, 90, 80, 100].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-md" style={{ width: w }} />
        ))}
      </div>
      <div className="border rounded-lg divide-y">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4">
            <Skeleton className="h-4 w-32" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-4 w-16 hidden md:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
