import { requireUser } from '@/lib/auth'
import { getDictionary, getLocale } from '@/lib/i18n'
import { prisma } from '@/lib/prisma'
import { resolveHrScope } from '@/lib/hr/scope'
import { buildFiseWhere, toFiseListRow, FISE_LIST_SELECT } from '@/lib/hr/fise'
import { FiseClient, type FiseLabels } from './fise-client'

export const metadata = { title: 'Fișe de aptitudine — Buzomed' }

export default async function HrFisePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const user = await requireUser()
  const locale = await getLocale()
  const labels = (getDictionary(locale) as { hrFise: FiseLabels }).hrFise
  const { q } = await searchParams

  const scope = await resolveHrScope(user.id)
  if (!scope.ok) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">Nicio companie atribuită</p>
        <p className="text-sm mt-1">
          Contactați administratorul cabinetului pentru a obține acces.
        </p>
      </div>
    )
  }

  const where = buildFiseWhere(scope, {})

  const [exams, newSince] = await Promise.all([
    prisma.examination.findMany({
      where,
      select: FISE_LIST_SELECT,
      orderBy: [{ examinedAt: 'desc' }, { completedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    user.lastSeenFiseAt
      ? prisma.examination.count({ where: { ...where, signedAt: { gt: user.lastSeenFiseAt } } })
      : prisma.examination.count({ where }),
  ])

  const rows = exams.map(toFiseListRow)

  // Mark this visit as seen so the "new since last visit" badge resets. Fire
  // and forget — a failure just leaves the badge stale, which is harmless.
  void prisma.user
    .update({ where: { id: user.id }, data: { lastSeenFiseAt: new Date() } })
    .catch((err) => console.warn('[hr/fise] lastSeenFiseAt update failed:', err))

  return (
    <FiseClient
      rows={rows}
      companies={scope.companies}
      newSince={newSince}
      locale={locale}
      labels={labels}
      initialSearch={q ?? ''}
    />
  )
}
