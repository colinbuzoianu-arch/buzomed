import Link from 'next/link'

export type BreadcrumbItem = {
  /** Visible label. Keep short — first names + entity types, not full paths. */
  label: string
  /** Optional href. Omit for the current page (last item). */
  href?: string
}

type BreadcrumbsProps = {
  items: BreadcrumbItem[]
  /** Optional className for the outer nav element */
  className?: string
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  if (items.length === 0) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[13px] text-[hsl(var(--text-muted))] ${className}`}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={i} className="flex items-center gap-x-1.5">
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors underline-offset-2 hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={isLast ? 'text-foreground font-medium' : ''}
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </span>
            )}
            {!isLast && (
              <span aria-hidden className="text-[hsl(var(--text-faint))] select-none">
                ›
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
