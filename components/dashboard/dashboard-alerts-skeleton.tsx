import { Skeleton } from '@/components/ui/skeleton'

/**
 * Minimal placeholder, not a full card grid: the real section is absent
 * more often than not (only renders when urgentCount > 0), so a
 * full-height skeleton would itself be a guaranteed CLS mismatch on the
 * common case. This just reserves a thin sliver while the count resolves.
 */
export function DashboardAlertsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-32" />
    </div>
  )
}
