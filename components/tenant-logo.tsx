'use client'

import { useState } from 'react'
import Image from 'next/image'

interface Props {
  logoUrl: string | null | undefined
  size?: 'sm' | 'md'
}

const heights: Record<NonNullable<Props['size']>, number> = {
  sm: 28,
  md: 36,
}

const MAX_WIDTH = 160

export function TenantLogo({ logoUrl, size = 'md' }: Props) {
  const [logoError, setLogoError] = useState(false)

  if (!logoUrl || logoError) return null

  const h = heights[size]

  return (
    <div
      key={logoUrl}
      style={{
        position: 'relative',
        height: h,
        width: MAX_WIDTH,
        flexShrink: 0,
      }}
    >
      <Image
        src={logoUrl}
        alt="Logo cabinet"
        fill
        sizes={`${MAX_WIDTH}px`}
        style={{ objectFit: 'contain' }}
        onError={() => setLogoError(true)}
      />
    </div>
  )
}
