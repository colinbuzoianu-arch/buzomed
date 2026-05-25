import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

// ─── SVG Illustrations ───────────────────────────────────────────────────────

function IllustrationCompanies({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="32" width="72" height="52" rx="3" stroke="currentColor" strokeWidth="2" />
      <rect x="28" y="20" width="40" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="48" x2="84" y2="48" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
      <rect x="24" y="56" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="42" y="56" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="60" y="56" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="36" y="68" width="24" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IllustrationEmployees({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="30" r="14" stroke="currentColor" strokeWidth="2" />
      <path d="M18 80c0-16.569 13.431-30 30-30s30 13.431 30 30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="38" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 72c0-11.046 7.163-20 16-20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 2" />
      <circle cx="76" cy="38" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M92 72c0-11.046-7.163-20-16-20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 2" />
    </svg>
  )
}

function IllustrationExaminations({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="18" y="12" width="52" height="68" rx="4" stroke="currentColor" strokeWidth="2" />
      <line x1="30" y1="30" x2="66" y2="30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="30" y1="40" x2="66" y2="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="30" y1="50" x2="52" y2="50" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="66" cy="66" r="14" fill="hsl(var(--primary) / 0.08)" stroke="currentColor" strokeWidth="2" />
      <line x1="66" y1="60" x2="66" y2="72" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="60" y1="66" x2="72" y2="66" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IllustrationRecalls({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="20" width="72" height="64" rx="4" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="36" x2="84" y2="36" stroke="currentColor" strokeWidth="1.5" />
      <line x1="30" y1="12" x2="30" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="66" y1="12" x2="66" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="56" r="4" fill="currentColor" />
      <circle cx="48" cy="56" r="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="64" cy="56" r="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="48" cy="70" r="4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IllustrationReports({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="80" height="80" rx="4" stroke="currentColor" strokeWidth="2" />
      <line x1="8" y1="28" x2="88" y2="28" stroke="currentColor" strokeWidth="1.5" />
      <rect x="18" y="40" width="12" height="32" rx="2" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <rect x="36" y="50" width="12" height="22" rx="2" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <rect x="54" y="44" width="12" height="28" rx="2" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      <rect x="72" y="55" width="8" height="17" rx="2" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IllustrationWorkplaces({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="40" width="76" height="48" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M10 48L48 24L86 48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="36" y="62" width="24" height="26" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="18" y="54" width="14" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="64" y="54" width="14" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <line x1="48" y1="62" x2="48" y2="88" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IllustrationInvoices({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" y="8" width="60" height="72" rx="4" stroke="currentColor" strokeWidth="2" />
      <line x1="26" y1="28" x2="62" y2="28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="26" y1="38" x2="54" y2="38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="26" y1="52" x2="62" y2="52" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" />
      <line x1="26" y1="60" x2="62" y2="60" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" />
      <line x1="26" y1="68" x2="62" y2="68" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" />
      <circle cx="74" cy="74" r="16" fill="white" stroke="currentColor" strokeWidth="2" />
      <path d="M74 66v8l5 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IllustrationContracts({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M54 8H22a4 4 0 00-4 4v72a4 4 0 004 4h52a4 4 0 004-4V34L54 8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M54 8v22a4 4 0 004 4h16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <line x1="30" y1="46" x2="66" y2="46" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="30" y1="56" x2="66" y2="56" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="30" y1="66" x2="50" y2="66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IllustrationTeam({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="32" r="14" stroke="currentColor" strokeWidth="2" />
      <path d="M20 82c0-15.464 12.536-28 28-28s28 12.536 28 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="18" cy="40" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 76c0-9.941 6.268-18 14-18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="78" cy="40" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M92 76c0-9.941-6.268-18-14-18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IllustrationDocuments({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="22" y="16" width="52" height="64" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M36 8h24a4 4 0 014 4v8H32v-8a4 4 0 014-4z" stroke="currentColor" strokeWidth="2" />
      <line x1="34" y1="42" x2="62" y2="42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="34" y1="52" x2="62" y2="52" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="34" y1="62" x2="50" y2="62" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IllustrationGeneric({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="80" height="80" rx="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="48" cy="44" r="16" stroke="currentColor" strokeWidth="2" />
      <line x1="48" y1="36" x2="48" y2="44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="48" cy="50" r="1.5" fill="currentColor" />
      <line x1="28" y1="72" x2="68" y2="72" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 3" />
    </svg>
  )
}

const ILLUSTRATIONS = {
  companies: IllustrationCompanies,
  employees: IllustrationEmployees,
  examinations: IllustrationExaminations,
  recalls: IllustrationRecalls,
  reports: IllustrationReports,
  workplaces: IllustrationWorkplaces,
  invoices: IllustrationInvoices,
  contracts: IllustrationContracts,
  team: IllustrationTeam,
  documents: IllustrationDocuments,
  generic: IllustrationGeneric,
}

export type EmptyStateIllustration = keyof typeof ILLUSTRATIONS

export interface EmptyStateAction {
  label: string
  href?: string
  onClick?: () => void
  variant?: 'default' | 'outline' | 'ghost'
}

export interface EmptyStateProps {
  illustration?: EmptyStateIllustration
  title: string
  description?: string
  primaryAction?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  size?: 'default' | 'compact'
  className?: string
}

export function EmptyState({
  illustration = 'generic',
  title,
  description,
  primaryAction,
  secondaryAction,
  size = 'default',
  className,
}: EmptyStateProps) {
  const Illustration = ILLUSTRATIONS[illustration]
  const isCompact = size === 'compact'

  return (
    <div
      className={cn(
        'flex flex-col items-center text-center border border-dashed rounded-lg bg-[hsl(var(--surface-muted))]',
        isCompact ? 'px-4 py-8' : 'px-6 py-12 sm:py-16',
        className
      )}
    >
      <Illustration
        className={cn(
          'text-[hsl(var(--text-faint))]',
          isCompact ? 'h-16 w-16' : 'h-24 w-24'
        )}
      />
      <h3
        className={cn(
          'font-display mt-4 font-normal tracking-tight text-foreground',
          isCompact ? 'text-base' : 'text-lg'
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            'mt-2 text-[hsl(var(--text-muted))] max-w-sm',
            isCompact ? 'text-xs' : 'text-sm'
          )}
        >
          {description}
        </p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className={cn('flex flex-wrap justify-center gap-2', isCompact ? 'mt-4' : 'mt-6')}>
          {primaryAction && (
            primaryAction.href ? (
              <Button asChild variant={primaryAction.variant ?? 'default'} size={isCompact ? 'sm' : 'default'}>
                <Link href={primaryAction.href}>{primaryAction.label}</Link>
              </Button>
            ) : (
              <Button onClick={primaryAction.onClick} variant={primaryAction.variant ?? 'default'} size={isCompact ? 'sm' : 'default'}>
                {primaryAction.label}
              </Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <Button asChild variant={secondaryAction.variant ?? 'outline'} size={isCompact ? 'sm' : 'default'}>
                <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
              </Button>
            ) : (
              <Button onClick={secondaryAction.onClick} variant={secondaryAction.variant ?? 'outline'} size={isCompact ? 'sm' : 'default'}>
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  )
}
