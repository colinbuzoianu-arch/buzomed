'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
}

export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav className="hidden md:flex items-center gap-0.5 text-sm">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== '/dashboard' && pathname.startsWith(item.href + '/')) ||
          (item.href !== '/dashboard' && pathname.startsWith(item.href + '?'))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              active
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
