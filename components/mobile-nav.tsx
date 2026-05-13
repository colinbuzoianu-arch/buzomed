'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { LogoutButton } from '@/components/logout-button'

interface NavItem {
  href: string
  label: string
}

interface Props {
  items: NavItem[]
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
 */
export function MobileNav({ items, userName, closeLabel, logoutLabel }: Props) {
  const [open, setOpen] = useState(false)
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
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          {/* Panel */}
          <div className="absolute inset-x-0 top-0 bg-background border-b shadow-lg">
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
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-4 py-3 text-base hover:bg-muted transition-colors"
                >
                  {item.label}
                </Link>
              ))}
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
