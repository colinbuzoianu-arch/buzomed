'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
}

export function ReportsNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <div className="flex flex-wrap gap-2 text-sm border-b pb-3 print:hidden">
      {items.map((item) => {
        const active =
          item.href === '/reports'
            ? pathname === '/reports'
            : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1 rounded-md border transition-colors ${
              active ? 'bg-secondary font-medium' : 'hover:bg-muted'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
