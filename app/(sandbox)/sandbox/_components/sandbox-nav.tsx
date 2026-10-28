'use client'

import { Lock, Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Sandbox navigation — same styles as the real AppNav/MobileNav, but
 * standalone so it can (a) carry disabled items with a tooltip and (b) avoid
 * importing LogoutButton (which pulls in Supabase, forbidden here).
 *
 * Enabled entries are the clickable demo pages; disabled entries are shown
 * greyed out with „Disponibil în versiunea completă".
 */

export interface SandboxNavItem {
  href: string
  label: string
}

const DISABLED_TOOLTIP = 'Disponibil în versiunea completă'

function isActive(pathname: string, href: string): boolean {
  if (href === '/sandbox') return pathname === '/sandbox'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function linkClass(active: boolean): string {
  return `px-3 py-1.5 rounded-md transition-colors ${
    active
      ? 'bg-primary/10 text-primary font-medium'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
  }`
}

export function SandboxNav({
  enabled,
  disabled,
}: {
  enabled: SandboxNavItem[]
  disabled: SandboxNavItem[]
}) {
  const pathname = usePathname()
  return (
    <nav className="hidden md:flex items-center gap-0.5 text-sm">
      {enabled.map((item) => (
        <Link key={item.href} href={item.href} className={linkClass(isActive(pathname, item.href))}>
          {item.label}
        </Link>
      ))}
      <span className="mx-1 w-px h-5 bg-border" />
      {disabled.map((item) => (
        <span
          key={item.label}
          title={DISABLED_TOOLTIP}
          aria-disabled="true"
          className="px-3 py-1.5 rounded-md text-muted-foreground/45 cursor-not-allowed inline-flex items-center gap-1 select-none"
        >
          {item.label}
          <Lock className="h-3 w-3" />
        </span>
      ))}
    </nav>
  )
}

export function SandboxMobileNav({
  enabled,
  disabled,
  userName,
}: {
  enabled: SandboxNavItem[]
  disabled: SandboxNavItem[]
  userName: string
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on route change
  useEffect(() => {
    setOpen(false)
  }, [pathname])

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
        aria-label="Deschide meniul"
      >
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Închide"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 top-0 bg-background border-b shadow-lg max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between px-4 h-16 border-b">
              <span className="text-sm font-medium truncate">{userName}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted shrink-0"
                aria-label="Închide"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex flex-col py-2">
              {enabled.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-4 py-3 text-base hover:bg-muted transition-colors"
                >
                  {item.label}
                </Link>
              ))}
              <div className="border-t mt-2 pt-2">
                {disabled.map((item) => (
                  <span
                    key={item.label}
                    title={DISABLED_TOOLTIP}
                    aria-disabled="true"
                    className="flex items-center justify-between px-4 py-3 text-base text-muted-foreground/45 cursor-not-allowed select-none"
                  >
                    {item.label}
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                ))}
                <p className="px-4 py-2 text-xs text-muted-foreground">{DISABLED_TOOLTIP}</p>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
