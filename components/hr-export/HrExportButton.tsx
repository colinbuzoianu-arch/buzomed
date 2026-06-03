'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type HrExportApiBase = 'practitioner' | 'hr-portal'

interface HrExportButtonProps {
  companyId: string
  apiBase: HrExportApiBase
  variant?: 'default' | 'outline'
}

const FORMATS = [
  { id: 'charisma', label: 'Charisma HR', ext: '.csv' },
  { id: 'nexus',    label: 'NEXUS HR',    ext: '.csv' },
  { id: 'pluriva',  label: 'Pluriva',     ext: '.csv' },
  { id: 'generic',  label: 'Universal / Excel', ext: '.xlsx' },
] as const

function buildUrl(
  companyId: string,
  format: string,
  apiBase: HrExportApiBase
): string {
  if (apiBase === 'hr-portal') {
    return `/api/hr/export?format=${format}&companyId=${encodeURIComponent(companyId)}`
  }
  return `/api/reports/company/${encodeURIComponent(companyId)}/hr-export?format=${format}`
}

export function HrExportButton({
  companyId,
  apiBase,
  variant = 'outline',
}: HrExportButtonProps) {
  const [open, setOpen] = useState(false)

  function handleSelect(format: string) {
    setOpen(false)
    window.location.href = buildUrl(companyId, format, apiBase)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant} size="sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-4 shrink-0"
            aria-hidden
          >
            <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
          </svg>
          Export HR
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-4 shrink-0 opacity-60"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="end">
        <p className="px-2 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Format export HR
        </p>
        {FORMATS.map((f) => (
          <button
            key={f.id}
            onClick={() => handleSelect(f.id)}
            className="w-full flex items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <span>{f.label}</span>
            <span className="text-xs text-muted-foreground font-mono">{f.ext}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
