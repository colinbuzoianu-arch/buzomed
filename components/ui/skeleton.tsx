import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'animate-pulse rounded-md bg-gradient-to-r from-[hsl(var(--surface-muted))] via-[hsl(var(--surface-tinted,220_20%_96%))] to-[hsl(var(--surface-muted))] bg-[length:200%_100%]',
        className
      )}
      style={{ animationDuration: '1.8s' }}
      {...props}
    />
  )
}

export { Skeleton }
