import type { Translator } from '@/lib/i18n'
import { prisma } from '@/lib/prisma'
import { DashboardAlertsView } from './dashboard-alerts-view'

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
        OR: [{ createdFromExaminationId: null }, { createdFromExamination: { deletedAt: null } }],
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

  return (
    <DashboardAlertsView counts={{ overdueRecalls, inProgressExams, unsignedCompleted }} t={t} />
  )
}
