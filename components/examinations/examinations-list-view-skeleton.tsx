import { Skeleton } from '@/components/ui/skeleton'

/**
 * Row count is a best-effort guess, not a match: the real query
 * paginates at 200 rows (LIST_PAGE_SIZE), far more than any reasonable
 * skeleton row count, so some reflow on swap-in is unavoidable. Mirrors
 * the shape used in loading.tsx (full-page navigation fallback).
 */
export function ExaminationsListViewSkeleton() {
  return (
    <div className="border rounded-lg divide-y">
      {Array.from({ length: 10 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders, never reordered
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
  )
}
