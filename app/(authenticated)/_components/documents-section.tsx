import type { DocumentEntityType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getTranslator, type Locale } from '@/lib/i18n'
import { DocumentsList } from './documents-list'

/**
 * Reusable section for any entity that can have documents attached.
 *
 * Usage:
 *   <DocumentsSection
 *     entityType="examination"
 *     entityId={examination.id}
 *     tenantId={user.tenantId}
 *     canWrite={caps.canWrite}
 *     locale={locale}
 *   />
 *
 * This is a server component so the initial document list is rendered
 * server-side (no client fetch waterfall). All mutations (upload,
 * delete) happen client-side via the API and trigger router.refresh().
 */

interface Props {
  entityType: DocumentEntityType
  entityId: string
  tenantId: string
  canWrite: boolean
  locale: Locale
}

export async function DocumentsSection({
  entityType,
  entityId,
  tenantId,
  canWrite,
  locale,
}: Props) {
  const t = getTranslator(locale)

  const documents = await prisma.document.findMany({
    where: {
      tenantId,
      entityType,
      entityId,
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 100,
    include: {
      uploadedBy: {
        select: { firstName: true, lastName: true },
      },
    },
  })

  // BigInt → number (≤ 15 MB) for serialization to the client component.
  const documentsForClient = documents.map((d) => ({
    id: d.id,
    filename: d.filename,
    documentType: d.documentType,
    mimeType: d.mimeType,
    fileSizeBytes: Number(d.fileSizeBytes),
    isOfficial: d.isOfficial,
    isGenerated: d.isGenerated,
    createdAt: d.createdAt.toISOString(),
    uploadedBy: d.uploadedBy
      ? `${d.uploadedBy.lastName} ${d.uploadedBy.firstName}`
      : null,
  }))

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t('documents.sectionTitle')}</h2>
      <DocumentsList
        entityType={entityType}
        entityId={entityId}
        canWrite={canWrite}
        documents={documentsForClient}
        locale={locale}
        labels={{
          empty: t('documents.empty'),
          emptyHint: t('documents.emptyHint'),
          uploadButton: t('documents.uploadButton'),
          uploading: t('documents.uploading'),
          delete: t('documents.delete'),
          deleteConfirm: t('documents.deleteConfirm'),
          deleting: t('documents.deleting'),
          download: t('documents.download'),
          opening: t('documents.opening'),
          uploadedBy: t('documents.uploadedBy'),
          uploadedOn: t('documents.uploadedOn'),
          official: t('documents.official'),
          generated: t('documents.generated'),
          chooseFile: t('documents.chooseFile'),
          documentType: t('documents.documentTypeLabel'),
          submit: t('documents.submit'),
          cancel: t('common.cancel'),
          errorTitle: t('documents.errorTitle'),
          allowedHint: t('documents.allowedHint'),
          documentTypes: {
            fisa_aptitudine: t('documents.types.fisa_aptitudine'),
            fisa_factori_risc: t('documents.types.fisa_factori_risc'),
            dosarul_medical: t('documents.types.dosarul_medical'),
            raport_medical: t('documents.types.raport_medical'),
            adeverinta_medicala: t('documents.types.adeverinta_medicala'),
            vaccination_certificate: t(
              'documents.types.vaccination_certificate'
            ),
            lab_result: t('documents.types.lab_result'),
            referral: t('documents.types.referral'),
            external_document: t('documents.types.external_document'),
            other: t('documents.types.other'),
          },
        }}
      />
    </section>
  )
}
