import { Skeleton } from '@/components/ui/skeleton'

/**
 * Row count is a best-effort guess, not a match: the real query has no
 * pagination (tenants realistically have anywhere from a handful to
 * 100+ companies — see docs/performance/list-audit-2026-08-20.md), so
 * no fixed skeleton row count can eliminate the reflow when the real
 * table swaps in. Sized closer to a typical tenant's count to reduce
 * the average shift rather than a low, guaranteed-short placeholder.
 * Mirrors the shapes in loading.tsx (used for full-page navigations).
 */
export function CompaniesListSkeleton() {
  return (
    <>
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <div className="border-b px-4 py-3 flex gap-8">
          {[140, 80, 80, 120, 60].map((w, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders, never reordered
            <Skeleton key={i} className="h-3.5" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders, never reordered
          <div key={i} className="px-4 py-3 border-b last:border-b-0 flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-20 ml-4" />
            <Skeleton className="h-4 w-24 ml-4" />
            <Skeleton className="h-4 w-28 ml-4" />
            <Skeleton className="h-4 w-12 ml-auto" />
          </div>
        ))}
      </div>
      <div className="md:hidden space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders, never reordered
          <div key={i} className="border rounded-lg p-4 flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </>
  )
}
