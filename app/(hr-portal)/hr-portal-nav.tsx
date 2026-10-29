'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface HrNavItem {
  href: string
  label: string
}

/** Primary HR-portal navigation, highlighting the active section. */
export function HrPortalNav({ items }: { items: HrNavItem[] }) {
  const pathname = usePathname()
  return (
    <nav className="flex items-center gap-1 text-sm">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
