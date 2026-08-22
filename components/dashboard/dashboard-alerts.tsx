import { prisma } from '@/lib/prisma'
import type { Translator } from '@/lib/i18n'
import { AlertCard } from './dashboard-cards'

export default async function DashboardAlerts({
  tenantId,
  t,
}: {
  tenantId: string
  t: Translator
}) {
  const [overdueRecalls, inProgressExams, unsignedCompleted] = await Promise.all([
    // Overdue recalls — the most urgent number
    prisma.recall.count({
      where: {
        tenantId,
        status: 'overdue',
        deletedAt: null,
        OR: [
          { createdFromExaminationId: null },
          { createdFromExamination: { deletedAt: null } },
        ],
      },
    }),

    // Examinations currently in progress
    prisma.examination.count({
      where: {
        tenantId,
        status: 'in_progress',
        deletedAt: null,
      },
    }),

    // Completed but not yet signed — the practitioner still needs to
    // sign these to generate the fișa de aptitudine
    prisma.examination.count({
      where: {
        tenantId,
        status: 'completed',
        signedAt: null,
        deletedAt: null,
      },
    }),
  ])

  const urgentCount = overdueRecalls + inProgressExams + unsignedCompleted
  if (urgentCount === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--text-muted))]">
        {t('dashboard.needsAttention')}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {overdueRecalls > 0 && (
          <AlertCard
            href="/examinations?tab=scadente&horizon=overdue"
            label={t('dashboard.overdueRecalls')}
            value={overdueRecalls}
            tone="destructive"
            description={t('dashboard.overdueRecallsDesc')}
          />
        )}
        {inProgressExams > 0 && (
          <AlertCard
            href="/examinations?tab=in_curs"
            label={t('dashboard.inProgress')}
            value={inProgressExams}
            tone="warning"
            description={t('dashboard.inProgressDesc')}
          />
        )}
        {unsignedCompleted > 0 && (
          <AlertCard
            href="/examinations?tab=finalizate"
            label={t('dashboard.unsignedFise')}
            value={unsignedCompleted}
            tone="warning"
            description={t('dashboard.unsignedFiseDesc')}
          />
        )}
      </div>
    </section>
  )
}
