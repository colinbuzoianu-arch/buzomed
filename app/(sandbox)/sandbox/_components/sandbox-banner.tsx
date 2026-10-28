'use client'

import { RotateCcw } from 'lucide-react'
import { useSandboxStore } from '@/lib/sandbox/store'

const CTA_URL = process.env.NEXT_PUBLIC_SANDBOX_CTA_URL || '/contact'

/**
 * Slim top banner for the demo: states that the data is fictional and
 * nothing is saved, and offers a reset + a call to action. Rendered inside
 * SandboxStoreProvider so „Resetează demo" can rebuild the fixtures.
 */
export function SandboxBanner() {
  const { reset } = useSandboxStore()

  return (
    <div className="w-full border-b bg-primary/5 text-foreground">
      <div className="container mx-auto px-4 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-medium">Demo interactiv Buzomed</span>
        <span className="text-muted-foreground">— date fictive, nimic nu se salvează.</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Resetează demo
          </button>
          <a
            href={CTA_URL}
            className="inline-flex items-center rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Vreau Buzomed
          </a>
        </div>
      </div>
    </div>
  )
}
