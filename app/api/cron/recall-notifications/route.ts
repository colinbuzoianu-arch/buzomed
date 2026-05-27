import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

/**
 * POST /api/cron/recall-notifications
 *
 * Sends one email per company whose employees have pending recalls due within
 * 7 days. Protected by CRON_SECRET header — never call directly from the
 * browser; use /api/admin/trigger-recall-notifications instead.
 *
 * Returns { sent, skipped } where skipped = companies with no email address.
 */
export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'cron_secret_not_configured' }, { status: 503 })
  }
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const sevenDaysLater = new Date(now)
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7)

  const recalls = await prisma.recall.findMany({
    where: {
      status: 'pending',
      deletedAt: null,
      dueDate: {
        gte: now,
        lte: sevenDaysLater,
      },
    },
    include: {
      employee: {
        select: { firstName: true, lastName: true },
      },
      workplace: {
        include: {
          company: {
            select: {
              id: true,
              name: true,
              email: true,
              recallNotificationEmail: true,
            },
          },
        },
      },
      examinationType: {
        select: { nameRo: true },
      },
    },
  })

  type RecallEntry = {
    companyId: string
    companyName: string
    emailTo: string
    recallIds: string[]
    employeeNames: string[]
    examinationTypes: string[]
    dueDates: Date[]
  }

  const byCompany = new Map<string, RecallEntry>()

  for (const recall of recalls) {
    const company = recall.workplace.company
    if (!company) continue
    const emailTo = company.recallNotificationEmail ?? company.email
    if (!emailTo) continue

    const existing = byCompany.get(company.id)
    const employeeName = `${recall.employee.firstName} ${recall.employee.lastName}`
    const examType = recall.examinationType.nameRo

    if (!existing) {
      byCompany.set(company.id, {
        companyId: company.id,
        companyName: company.name,
        emailTo,
        recallIds: [recall.id],
        employeeNames: [employeeName],
        examinationTypes: [examType],
        dueDates: [recall.dueDate],
      })
    } else {
      existing.recallIds.push(recall.id)
      existing.employeeNames.push(employeeName)
      existing.examinationTypes.push(examType)
      existing.dueDates.push(recall.dueDate)
    }
  }

  let sent = 0
  let skipped = 0

  // Count recalls where the company has no email (before grouping)
  for (const recall of recalls) {
    const company = recall.workplace.company
    if (!company || (!company.recallNotificationEmail && !company.email)) {
      skipped++
    }
  }

  for (const [, group] of byCompany) {
    const rows = group.recallIds
      .map(
        (_, i) =>
          `<tr>
            <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${group.employeeNames[i]}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${group.examinationTypes[i]}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${group.dueDates[i].toLocaleDateString('ro-RO')}</td>
          </tr>`
      )
      .join('')

    const html = `
      <p>Bună ziua,</p>
      <p>Vă informăm că următorii angajați ai companiei <strong>${group.companyName}</strong> au examene de medicina muncii scadente în 7 zile:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e2e8f0">Angajat</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e2e8f0">Tip examinare</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e2e8f0">Data scadentă</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px">Vă rugăm să contactați cabinetul medical pentru programare.</p>
    `

    const text =
      `Examene scadente în 7 zile pentru ${group.companyName}:\n` +
      group.recallIds
        .map(
          (_, i) =>
            `- ${group.employeeNames[i]}: ${group.examinationTypes[i]} (${group.dueDates[i].toLocaleDateString('ro-RO')})`
        )
        .join('\n') +
      '\n\nVă rugăm să contactați cabinetul medical pentru programare.'

    const result = await sendEmail({
      to: { email: group.emailTo, name: group.companyName },
      content: {
        subject: `Examene scadente — ${group.companyName}`,
        html,
        text,
      },
      tags: ['recall-notification'],
    })

    if (result.success) {
      await prisma.recall.updateMany({
        where: { id: { in: group.recallIds } },
        data: {
          notificationSentAt: now,
          notificationCount: { increment: 1 },
        },
      })
      sent++
    } else {
      console.error('[recall-notifications] failed to send to', group.emailTo, result.error)
      // Don't count these as skipped — they attempted to send but failed
    }
  }

  return NextResponse.json({ sent, skipped })
}
