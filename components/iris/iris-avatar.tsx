/**
 * Iris avatar — geometric SVG inspired by the anatomical iris.
 * Used in the chat panel header and the floating trigger button.
 */

type IrisAvatarProps = {
  size?: number
  className?: string
}

export function IrisAvatar({ size = 32, className = '' }: IrisAvatarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Outer ring */}
      <circle
        cx="16" cy="16" r="14"
        stroke="hsl(var(--primary))"
        strokeWidth="1.2"
        opacity="0.25"
      />
      {/* Mid ring */}
      <circle
        cx="16" cy="16" r="10"
        stroke="hsl(var(--primary))"
        strokeWidth="1.2"
        opacity="0.5"
      />
      {/* Iris petal lines — 8 spokes, subtle */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180
        const x1 = 16 + 10 * Math.cos(rad)
        const y1 = 16 + 10 * Math.sin(rad)
        const x2 = 16 + 14 * Math.cos(rad)
        const y2 = 16 + 14 * Math.sin(rad)
        return (
          <line
            key={deg}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="hsl(var(--primary))"
            strokeWidth="0.8"
            opacity="0.3"
          />
        )
      })}
      {/* Inner filled circle — pupil */}
      <circle
        cx="16" cy="16" r="4"
        fill="hsl(var(--primary))"
      />
      {/* Catchlight — tiny white dot */}
      <circle
        cx="17.5" cy="14.5" r="1"
        fill="white"
        opacity="0.8"
      />
    </svg>
  )
}
