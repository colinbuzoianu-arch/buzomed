'use client'

import { ChevronDown, Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { NavEntry } from '@/components/app-nav'
import { LogoutButton } from '@/components/logout-button'

interface Props {
  items: NavEntry[]
  userName: string
  closeLabel: string
  logoutLabel: string
}

/**
 * Mobile-only hamburger menu. The toggle button is hidden on screens
 * ≥ md (768px); the desktop nav lives in the layout component itself.
 *
 * Pattern: slide-down sheet anchored to the top, full-width, with a
 * tap-outside-to-dismiss overlay. Simpler than a true side drawer and
 * matches the existing header height.
 *
 * Closes automatically on route change (the usePathname effect).
 *
 * Dropdown groups (Administrare, Setări) render as expandable
 * sections here — no hover/click-away semantics needed since the
 * whole drawer is already a single open/closed state.
 */
export function MobileNav({ items, userName, closeLabel, logoutLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const pathname = usePathname()

  // Close on route change. Even though the Link will refresh the page,
  // the menu state would otherwise persist visually for a moment.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Lock body scroll while open.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [open])

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          {/* Panel */}
          <div className="absolute inset-x-0 top-0 bg-background border-b shadow-lg max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between px-4 h-16 border-b">
              <span className="text-sm font-medium truncate">{userName}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted shrink-0"
                aria-label={closeLabel}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex flex-col py-2">
              {items.map((entry) => {
                if (entry.type === 'link') {
                  return (
                    <Link
                      key={entry.href}
                      href={entry.href}
                      className="px-4 py-3 text-base hover:bg-muted transition-colors"
                    >
                      {entry.label}
                    </Link>
                  )
                }

                const isOpen = openGroups.has(entry.label)
                return (
                  <div key={entry.label}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(entry.label)}
                      className="w-full flex items-center justify-between px-4 py-3 text-base hover:bg-muted transition-colors"
                      aria-expanded={isOpen}
                    >
                      {entry.label}
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isOpen && (
                      <div className="bg-muted/30">
                        {entry.items.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="block px-8 py-2.5 text-sm hover:bg-muted transition-colors"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="px-4 py-3 border-t mt-2">
                <LogoutButton label={logoutLabel} />
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
