import Image from 'next/image'
import Link from 'next/link'

/**
 * Centralized Buzomed branding component.
 *
 * Two variants:
 *   - 'icon': just the symbol. Used in the auth header nav and as a
 *     fallback on tight screens.
 *   - 'wordmark': icon + "buzomed" + tagline. Used on the login page
 *     and other places with space.
 *
 * The component renders a Next.js <Image> with explicit dimensions so
 * there's no layout shift on load. Both variants link back to '/'.
 *
 * The `as` prop lets the caller decide whether the logo is a Link
 * (default, navigates home) or a plain div (for the login page where
 * being a link would be circular).
 */

interface Props {
  variant?: 'icon' | 'wordmark'
  size?: 'sm' | 'md' | 'lg'
  as?: 'link' | 'plain'
  className?: string
}

export function BuzomedLogo({
  variant = 'icon',
  size = 'md',
  as = 'link',
  className = '',
}: Props) {
  // Icon dimensions: square. Wordmark dimensions: ~3.2:1 aspect.
  const iconDims: Record<NonNullable<Props['size']>, number> = {
    sm: 28,
    md: 36,
    lg: 64,
  }
  const wordmarkDims: Record<
    NonNullable<Props['size']>,
    { w: number; h: number }
  > = {
    sm: { w: 140, h: 44 },
    md: { w: 200, h: 64 },
    lg: { w: 320, h: 100 },
  }

  const content =
    variant === 'icon' ? (
      <Image
        src="/buzomed-icon.png"
        alt="Buzomed"
        width={iconDims[size]}
        height={iconDims[size]}
        priority
        className="object-contain"
      />
    ) : (
      <Image
        src="/buzomed-wordmark.png"
        alt="Buzomed — Occupational Health. Healthy Workplaces."
        width={wordmarkDims[size].w}
        height={wordmarkDims[size].h}
        priority
        className="object-contain"
      />
    )

  if (as === 'plain') {
    return <div className={`inline-flex items-center ${className}`}>{content}</div>
  }

  return (
    <Link
      href="/"
      className={`inline-flex items-center ${className}`}
      aria-label="Buzomed home"
    >
      {content}
    </Link>
  )
}
