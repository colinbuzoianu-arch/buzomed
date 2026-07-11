import { Skeleton } from '@/components/ui/skeleton'

export default function SystemHealthLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      {/* 8 sections, each a filter row + table */}
      {[1, 2, 3, 4, 5, 6, 7, 8].map((section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-32 rounded-md" />
            ))}
          </div>
          <div className="border rounded-lg overflow-hidden">
            <Skeleton className="h-9 w-full rounded-none" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-none border-t" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
