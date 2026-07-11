import { Skeleton } from '@/components/ui/skeleton'

export default function AuditLogLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Skeleton className="h-10 w-full rounded-none" />
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-none border-t" />
        ))}
      </div>
    </div>
  )
}
