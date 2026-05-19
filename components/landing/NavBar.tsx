'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export function NavBar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className="sticky top-0 z-50 bg-white transition-all duration-200"
      style={
        scrolled
          ? { borderBottom: '1px solid #E2E8F0', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }
          : undefined
      }
    >
      <div className="max-w-7xl mx-auto px-6 xl:px-12 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2.5" style={{ textDecoration: 'none' }}>
          <Image src="/buzomed-icon.png" width={32} height={32} alt="Buzomed" />
          <span
            style={{
              fontWeight: 600,
              fontSize: 18,
              color: '#0F1F3A',
              letterSpacing: '-0.01em',
            }}
          >
            buzomed
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/login">
            <button
              style={{
                background: 'white',
                color: '#1E4D8B',
                padding: '8px 20px',
                borderRadius: 8,
                fontWeight: 500,
                fontSize: 15,
                border: '1px solid #1E4D8B',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) =>
                ((e.target as HTMLButtonElement).style.background = '#EBF3FB')
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLButtonElement).style.background = 'white')
              }
            >
              Login
            </button>
          </Link>
          <Link href="/register">
            <button
              style={{
                background: '#1E4D8B',
                color: 'white',
                padding: '8px 20px',
                borderRadius: 8,
                fontWeight: 500,
                fontSize: 15,
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) =>
                ((e.target as HTMLButtonElement).style.background = '#163d70')
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLButtonElement).style.background = '#1E4D8B')
              }
            >
              Înregistrare gratuită
            </button>
          </Link>
        </div>
      </div>
    </nav>
  )
}
