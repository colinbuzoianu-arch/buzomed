import { Skeleton } from '@/components/ui/skeleton'

function ListCardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="divide-y">
        {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].slice(0, rows).map((k) => (
          <div key={k} className="flex items-center gap-3 px-4 py-2.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function TodayAgendaSkeleton() {
  return <ListCardSkeleton rows={4} />
}

export function ControlsCardSkeleton() {
  return <ListCardSkeleton rows={4} />
}
