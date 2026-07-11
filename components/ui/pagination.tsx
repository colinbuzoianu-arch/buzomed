import Link from 'next/link'

/**
 * Shared page-number pagination — extracted from the pattern originally
 * built inline in super-admin/system-health/page.tsx. `paramName` lets
 * different sections on the same page paginate independently (e.g. `page`,
 * `errPage`, `auditPage`), and `params` should be the full current
 * searchParams object so every other active filter is preserved when the
 * page link is followed.
 */
interface PaginationLinkProps {
  href: string
  params: Record<string, string | undefined>
  paramName: string
  page: number
  children: React.ReactNode
}

export function PaginationLink({ href, params, paramName, page, children }: PaginationLinkProps) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== paramName) qs.set(k, v)
  }
  qs.set(paramName, String(page))
  return (
    <Link
      href={`${href}?${qs}`}
      className="rounded border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
    >
      {children}
    </Link>
  )
}

interface PaginationProps {
  href: string
  params: Record<string, string | undefined>
  paramName: string
  page: number
  totalPages: number
}

/** "Pagina X din Y" + Previous/Next links. Renders nothing when there's only one page. */
export function Pagination({ href, params, paramName, page, totalPages }: PaginationProps) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        Pagina {page} din {totalPages}
      </span>
      {page > 1 && (
        <PaginationLink href={href} params={params} paramName={paramName} page={page - 1}>
          ← Anterior
        </PaginationLink>
      )}
      {page < totalPages && (
        <PaginationLink href={href} params={params} paramName={paramName} page={page + 1}>
          Următor →
        </PaginationLink>
      )}
    </div>
  )
}
