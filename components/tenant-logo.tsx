'use client'

import { useState } from 'react'

interface Props {
  logoUrl: string | null | undefined
  size?: 'sm' | 'md'
}

const heights: Record<NonNullable<Props['size']>, number> = {
  sm: 28,
  md: 36,
}

export function TenantLogo({ logoUrl, size = 'md' }: Props) {
  const [logoError, setLogoError] = useState(false)

  if (!logoUrl || logoError) return null

  const h = heights[size]

  return (
    <div
      key={logoUrl}
      style={{
        height: h,
        width: 'auto',
        maxWidth: 160,
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt="Logo cabinet"
        style={{
          height: h,
          width: 'auto',
          maxWidth: 160,
          objectFit: 'contain',
          display: 'block',
        }}
        onError={() => setLogoError(true)}
      />
    </div>
  )
}
