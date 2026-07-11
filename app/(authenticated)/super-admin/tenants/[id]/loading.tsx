import { Skeleton } from '@/components/ui/skeleton'

export default function TenantDetailLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-1.5 items-end flex flex-col">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      {/* Activity dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      {/* Tenant info card */}
      <Skeleton className="h-48 rounded-lg" />
      {/* GDPR section */}
      <Skeleton className="h-32 rounded-lg" />
      {/* Subscription actions */}
      <Skeleton className="h-24 rounded-lg" />
      {/* Members table */}
      <div className="border rounded-lg overflow-hidden">
        <Skeleton className="h-10 w-full rounded-none" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-none border-t" />
        ))}
      </div>
    </div>
  )
}
