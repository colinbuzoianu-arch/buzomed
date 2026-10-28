'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Sandbox reports tabs — same look as the real ReportsNav, but with active
 * logic that treats /sandbox/reports as an exact match (the real one
 * hard-codes the string "/reports").
 */
export function SandboxReportsNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname()
  return (
    <div className="flex flex-wrap gap-2 text-sm border-b pb-3">
      {items.map((item) => {
        const active =
          item.href === '/sandbox/reports'
            ? pathname === '/sandbox/reports'
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
