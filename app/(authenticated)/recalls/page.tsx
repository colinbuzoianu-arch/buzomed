import { redirect } from 'next/navigation'

/**
 * /recalls is the legacy URL from session 9. The Programări page has
 * been merged into /examinations under the Scadențe tab (session 10
 * fixup). This shim preserves bookmarks and muscle memory.
 *
 * Query params are forwarded as-is:
 *   /recalls                     → /examinations?tab=scadente
 *   /recalls?horizon=overdue     → /examinations?tab=scadente&horizon=overdue
 *   /recalls?horizon=thisWeek&companyId=X
 *                                → /examinations?tab=scadente&horizon=thisWeek&companyId=X
 */

interface PageProps {
  searchParams: Promise<{ horizon?: string; companyId?: string }>
}

export default async function RecallsLegacyRedirect({
  searchParams,
}: PageProps) {
  const params = await searchParams
  const qs = new URLSearchParams({ tab: 'scadente' })
  if (params.horizon) qs.set('horizon', params.horizon)
  if (params.companyId) qs.set('companyId', params.companyId)
  redirect(`/examinations?${qs.toString()}`)
}
