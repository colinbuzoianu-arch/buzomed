import { Skeleton } from '@/components/ui/skeleton'

export default function PractitionerSettingsLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-64" />
      </div>
      {[1, 2].map((i) => (
        <div key={i} className="space-y-4">
          <Skeleton className="h-5 w-36" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-10 rounded-md" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-10 rounded-md" />
            </div>
          </div>
        </div>
      ))}
      <Skeleton className="h-32 rounded-lg" />
      <Skeleton className="h-10 w-36 rounded-lg" />
    </div>
  )
}
