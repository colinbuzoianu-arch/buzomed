import { Skeleton } from '@/components/ui/skeleton'

/**
 * Mirrors ScadenteView's own structure (horizon sub-tabs + recall table),
 * which streams independently from the top-level examinations tabs.
 * Row count is a best-effort guess, not a match — the real query
 * paginates at 100 rows (SCADENTE_PAGE_SIZE), so some reflow on swap-in
 * is unavoidable without deeper pagination changes (out of scope here).
 */
export function ScadenteViewSkeleton() {
  return (
    <div className="space-y-4">
      {/* Horizon sub-tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {[90, 90, 100, 110, 70].map((w, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders, never reordered
          <Skeleton key={i} className="h-7 rounded-md flex-shrink-0" style={{ width: w }} />
        ))}
      </div>
      {/* Recall table */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <div className="border-b px-4 py-2 flex gap-6 bg-muted/30">
          {[100, 100, 100, 100, 80, 80, 70].map((w, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders, never reordered
            <Skeleton key={i} className="h-3" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders, never reordered
          <div key={i} className="px-4 py-3 border-b last:border-b-0 flex items-center gap-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders, never reordered
          <div key={i} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
