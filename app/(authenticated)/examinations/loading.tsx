import { Skeleton } from '@/components/ui/skeleton'

export default function ExaminationsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      {/* Tab row */}
      <div className="flex gap-2">
        {[80, 100, 72, 88, 60].map((w, i) => (
          <Skeleton key={i} className={`h-8 w-[${w}px]`} />
        ))}
      </div>
      {/* Row list */}
      <div className="border rounded-lg divide-y">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
