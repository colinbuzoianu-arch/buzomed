import { Skeleton } from '@/components/ui/skeleton'

export default function ExpirationReportLoading() {
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
        {[80, 70, 70, 70, 80].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-md" style={{ width: w }} />
        ))}
      </div>
      <div className="border rounded-lg divide-y">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-4 w-24 hidden sm:block" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
