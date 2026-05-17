import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLocale, getTranslator } from '@/lib/i18n'
import { tenantDataCapabilities } from '@/lib/permissions/tenant-data'
import { FisaArchiveButton } from './fisa-archive-button'
import './fisa.css'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Fișa de aptitudine — the official one-page document the worker takes
 * back to their employer. Layout matches the HG 355/2007 model form
 * approximately (this is an MVP — pixel-perfect alignment to the
 * official Word template is a future refinement).
 *
 * Print-to-PDF: the page uses a dedicated stylesheet (fisa.css) with
 * @media print rules so "Print" in the browser produces a clean A4
 * page. No header / nav / sidebar. Real PDF generation (puppeteer or
 * @react-pdf/renderer) is the next step on this path; the template
 * doesn't need to change when that lands.
 *
 * Anyone with read access can view; the document is what gets handed
 * to the worker so cabinet staff need to be able to reprint.
 */

export default async function FisaPage({ params }: PageProps) {
  const user = await requireUser()
  const locale = await getLocale()
  const t = getTranslator(locale)

  if (user.roles.includes('super_admin')) redirect('/super-admin')
  if (!user.tenantId) redirect('/')

  const caps = tenantDataCapabilities(user, user.tenantId)
  if (!caps.canRead) redirect('/')

  const { id } = await params

  const examination = await prisma.examination.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    include: {
      tenant: true,
      employee: true,
      workplace: {
        include: {
          company: true,
        },
      },
      examinationType: true,
      practitioner: {
        select: {
          firstName: true,
          lastName: true,
          professionalTitle: true,
          professionalCode: true,
        },
      },
      location: true,
    },
  })

  if (!examination) notFound()

  // Check if a generated fișa is already archived in Documents (for the save button state)
  const archivedFisa = examination.signedAt
    ? await prisma.document.findFirst({
        where: {
          tenantId: user.tenantId,
          entityType: 'examination',
          entityId: id,
          documentType: 'fisa_aptitudine',
          isGenerated: true,
          deletedAt: null,
        },
        select: { id: true },
      })
    : null

  // We render the fișa regardless of signed state for cabinet
  // convenience (e.g., draft preview), but flag it.
  const dateFormatter = new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'long',
  })

  const verdictText = examination.verdict
    ? t(`examinations.form.verdict.${examination.verdict}`)
    : '—'

  return (
    <div className="fisa-wrapper">
      <div className="fisa-controls print:hidden">
        <Link
          href={`/examinations/${examination.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('examinations.fisa.backToExamination')}
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {examination.signedAt && caps.canWriteAdministrative && (
            <FisaArchiveButton
              examinationId={examination.id}
              alreadyArchived={archivedFisa !== null}
              labels={{
                save: t('examinations.fisa.saveToDocuments'),
                saving: t('examinations.fisa.savingToDocuments'),
                saved: t('examinations.fisa.savedToDocuments'),
                error: t('examinations.fisa.saveToDocumentsError'),
              }}
            />
          )}
          <a
            href={`/api/examinations/${examination.id}/fisa-pdf`}
            download
            className="rounded-md border border-primary text-primary px-4 py-2 text-sm font-medium hover:bg-primary/5"
          >
            {t('examinations.fisa.downloadPdf')}
          </a>
          <button
            type="button"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
            // eslint-disable-next-line react/no-unknown-property
            {...{
              'data-print-button': 'true',
            }}
          >
            {t('examinations.fisa.printButton')}
          </button>
        </div>
      </div>

      {!examination.signedAt && (
        <div className="fisa-draft-banner print:bg-yellow-100">
          {t('examinations.fisa.draftBanner')}
        </div>
      )}

      <article className="fisa-page">
        <header className="fisa-header">
          <div className="fisa-cabinet">
            <strong>{examination.tenant.legalName ?? examination.tenant.name}</strong>
            {examination.location.addressLine1 && (
              <div className="fisa-cabinet-address">
                {[
                  examination.location.addressLine1,
                  examination.location.addressLine2,
                  examination.location.city,
                  examination.location.county,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </div>
            )}
          </div>
          <div className="fisa-meta">
            <div>
              {t('examinations.fisa.numberLabel')}:{' '}
              <strong>{examination.examinationNumber}</strong>
            </div>
            <div>
              {t('examinations.fisa.dateLabel')}:{' '}
              <strong>
                {dateFormatter.format(
                  examination.signedAt ??
                    examination.completedAt ??
                    examination.createdAt
                )}
              </strong>
            </div>
          </div>
        </header>

        <h1 className="fisa-title">{t('examinations.fisa.title')}</h1>
        <p className="fisa-subtitle">{t('examinations.fisa.subtitle')}</p>

        <section className="fisa-section">
          <div className="fisa-row">
            <span className="fisa-label">
              {t('examinations.fisa.workerName')}:
            </span>
            <span className="fisa-value">
              {examination.employee.lastName} {examination.employee.firstName}
            </span>
          </div>
          {examination.employee.birthDate && (
            <div className="fisa-row">
              <span className="fisa-label">
                {t('examinations.fisa.workerBirthdate')}:
              </span>
              <span className="fisa-value">
                {dateFormatter.format(examination.employee.birthDate)}
              </span>
            </div>
          )}
          {examination.employee.idDocumentNumber && (
            <div className="fisa-row">
              <span className="fisa-label">
                {t('examinations.fisa.workerIdDocument')}:
              </span>
              <span className="fisa-value">
                {examination.employee.idDocumentNumber}
              </span>
            </div>
          )}
        </section>

        <section className="fisa-section">
          <div className="fisa-row">
            <span className="fisa-label">{t('examinations.fisa.employer')}:</span>
            <span className="fisa-value">
              {examination.workplace.company.name}
              {examination.workplace.company.cui
                ? ` (CUI: ${examination.workplace.company.cui})`
                : ''}
            </span>
          </div>
          <div className="fisa-row">
            <span className="fisa-label">{t('examinations.fisa.workplace')}:</span>
            <span className="fisa-value">
              {examination.workplace.name}
              {examination.workplace.department
                ? ` — ${examination.workplace.department}`
                : ''}
            </span>
          </div>
        </section>

        <section className="fisa-section">
          <div className="fisa-row">
            <span className="fisa-label">
              {t('examinations.fisa.examinationType')}:
            </span>
            <span className="fisa-value">
              {examination.examinationType.nameRo}
            </span>
          </div>
          {examination.examinationType.legalReference && (
            <div className="fisa-row">
              <span className="fisa-label">
                {t('examinations.fisa.legalBasis')}:
              </span>
              <span className="fisa-value">
                {examination.examinationType.legalReference}
              </span>
            </div>
          )}
        </section>

        <section className="fisa-verdict-section">
          <h2>{t('examinations.fisa.verdictHeader')}</h2>
          <div className="fisa-verdict-options">
            {(['apt', 'apt_conditionat', 'inapt_temporar', 'inapt'] as const).map(
              (v) => (
                <div
                  key={v}
                  className={`fisa-verdict-option ${
                    examination.verdict === v ? 'fisa-verdict-selected' : ''
                  }`}
                >
                  <span className="fisa-checkbox">
                    {examination.verdict === v ? '☒' : '☐'}
                  </span>
                  {t(`examinations.form.verdict.${v}`)}
                </div>
              )
            )}
          </div>
          {examination.verdictConditions && (
            <div className="fisa-conditions">
              <strong>{t('examinations.fisa.conditions')}:</strong>{' '}
              {examination.verdictConditions}
            </div>
          )}
          {examination.verdict === 'inapt_temporar' &&
            examination.inaptTemporarUntil && (
              <div className="fisa-conditions">
                <strong>{t('examinations.fisa.inaptUntil')}:</strong>{' '}
                {dateFormatter.format(examination.inaptTemporarUntil)}
              </div>
            )}
          {examination.nextExaminationDueDate && (
            <div className="fisa-next-due">
              <strong>{t('examinations.fisa.nextDue')}:</strong>{' '}
              {dateFormatter.format(examination.nextExaminationDueDate)}
            </div>
          )}
        </section>

        {examination.recommendations && (
          <section className="fisa-section">
            <h2 className="fisa-subhead">
              {t('examinations.fisa.recommendations')}
            </h2>
            <div className="fisa-prose">{examination.recommendations}</div>
          </section>
        )}

        <footer className="fisa-footer">
          <div className="fisa-signature-block">
            <div className="fisa-signature-line">_______________________________</div>
            <div className="fisa-signature-name">
              {examination.practitioner.professionalTitle ?? ''}{' '}
              {examination.practitioner.lastName}{' '}
              {examination.practitioner.firstName}
            </div>
            {examination.practitioner.professionalCode && (
              <div className="fisa-signature-meta">
                {t('examinations.fisa.parafa')}:{' '}
                {examination.practitioner.professionalCode}
              </div>
            )}
            <div className="fisa-signature-meta">
              {t('examinations.fisa.signatureLabel')}
              {examination.signedAt && (
                <>
                  {' — '}
                  {dateFormatter.format(examination.signedAt)}
                </>
              )}
            </div>
          </div>
        </footer>
      </article>

      {/* Inline print button wiring — tiny, no client component overhead. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.querySelector('[data-print-button]')?.addEventListener('click', () => window.print());
          `,
        }}
      />
    </div>
  )
}
