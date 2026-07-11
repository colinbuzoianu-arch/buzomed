import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsApiLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {[1, 2].map((section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <div className="border rounded-lg overflow-hidden">
            <Skeleton className="h-10 w-full rounded-none" />
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-none border-t" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
