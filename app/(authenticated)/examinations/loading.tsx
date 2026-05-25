import { Skeleton } from '@/components/ui/skeleton'

export default function ExaminationsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {[80, 90, 80, 90, 80].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-md flex-shrink-0" style={{ width: w }} />
        ))}
      </div>
      {/* List */}
      <div className="border rounded-lg divide-y">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-24 hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
