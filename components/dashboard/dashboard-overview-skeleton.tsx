import { Skeleton } from '@/components/ui/skeleton'

export function DashboardOverviewSkeleton() {
  return (
    <div className="border-t pt-6">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-24" />
      </div>
    </div>
  )
}
