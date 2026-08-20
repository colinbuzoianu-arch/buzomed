'use client'

import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface NavLink {
  href: string
  label: string
}

export interface NavGroup {
  label: string
  items: NavLink[]
}

/**
 * A top-level nav entry is either a direct link or a dropdown group of
 * links. Shared between the desktop nav (this file) and the mobile
 * drawer (mobile-nav.tsx) so both stay in sync with a single data source
 * built in the layout.
 */
export type NavEntry = ({ type: 'link' } & NavLink) | ({ type: 'group' } & NavGroup)

function isActiveHref(pathname: string, href: string): boolean {
  return (
    pathname === href ||
    (href !== '/dashboard' && pathname.startsWith(`${href}/`)) ||
    (href !== '/dashboard' && pathname.startsWith(`${href}?`))
  )
}

function linkClass(active: boolean): string {
  return `px-3 py-1.5 rounded-md transition-colors ${
    active
      ? 'bg-primary/10 text-primary font-medium'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
  }`
}

export function AppNav({ items }: { items: NavEntry[] }) {
  const pathname = usePathname()
  return (
    <nav className="hidden md:flex items-center gap-0.5 text-sm">
      {items.map((entry) => {
        if (entry.type === 'link') {
          const active = isActiveHref(pathname, entry.href)
          return (
            <Link key={entry.href} href={entry.href} className={linkClass(active)}>
              {entry.label}
            </Link>
          )
        }

        const groupActive = entry.items.some((item) => isActiveHref(pathname, item.href))
        return (
          <DropdownMenu key={entry.label}>
            <DropdownMenuTrigger
              className={`${linkClass(groupActive)} inline-flex items-center gap-1 outline-none data-[state=open]:bg-muted [&[data-state=open]>svg]:rotate-180`}
            >
              {entry.label}
              <ChevronDown className="h-3.5 w-3.5 transition-transform duration-150" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {entry.items.map((item) => {
                const active = isActiveHref(pathname, item.href)
                return (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link
                      href={item.href}
                      className={active ? 'bg-primary/10 text-primary font-medium' : ''}
                    >
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      })}
    </nav>
  )
}
