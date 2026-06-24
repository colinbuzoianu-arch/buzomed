import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData } from '@/lib/permissions/tenant-data'
import { EXAM_TYPE_DOCUMENTS } from '@/lib/examinations/document-templates'
import { fillExaminationPdf } from '@/lib/examinations/pdf-fill'

interface RouteContext {
  params: Promise<{ id: string; docKey: string }>
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const auth = await getApiUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!auth.user.tenantId || !canReadTenantData(auth.user, auth.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id, docKey } = await ctx.params

  const examination = await prisma.examination.findFirst({
    where: { id, tenantId: auth.user.tenantId, deletedAt: null },
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          birthDate: true,
          gender: true,
          idDocumentType: true,
          idDocumentNumber: true,
          jobTitle: true,
        },
      },
      workplace: { include: { company: true } },
      examinationType: { select: { nameRo: true, code: true } },
    },
  })

  if (!examination) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const docs = EXAM_TYPE_DOCUMENTS[examination.examinationType.code] ?? []
  const doc = docs.find((d) => d.key === docKey)
  if (!doc) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 })
  }
  if (process.env.NODE_ENV === 'development') {
    console.log('[doc-fill] generating', docKey, 'for exam', id)
  }

  const vs = (examination.vitalSigns ?? {}) as Record<string, unknown>
  const vt = (examination.visionTest ?? {}) as Record<string, unknown>
  const str = (v: unknown): string =>
    v !== null && v !== undefined && v !== '' ? String(v) : ''
  const examDate = formatDateRo(examination.completedAt ?? examination.createdAt)
  const nextDueDate = examination.nextExaminationDueDate
    ? formatDateRo(examination.nextExaminationDueDate)
    : ''
  const verdict = examination.verdict ?? ''

  let fields: Record<string, string | boolean> = {}

  if (docKey === 'fisa_aptitudine') {
    const TYPE_CHECKBOX: Record<string, string> = {
      angajare: 'tip_Angaja',
      control_periodic: 'tip_Examen',
      adaptare: 'tip_Adapta',
      reluare_munca: 'tip_Reluar',
      supraveghere_medicala_speciala: 'tip_Suprav',
    }
    const typeCheckField =
      TYPE_CHECKBOX[examination.examinationType.code] ?? 'tip_Altele'

    const companyAddr = [
      examination.workplace.company.addressLine1,
      examination.workplace.company.city,
    ].filter(Boolean).join(', ')

    for (const suffix of ['_A', '_B']) {
      fields[`societate${suffix}`] = examination.workplace.company.name
      fields[`adresa${suffix}`] = companyAddr
      fields[`nume${suffix}`] = examination.employee.lastName
      fields[`prenume${suffix}`] = examination.employee.firstName
      fields[`cnp${suffix}`] = examination.employee.idDocumentNumber ?? ''
      fields[`ocupatia${suffix}`] = examination.employee.jobTitle ?? ''
      fields[`post${suffix}`] = examination.workplace.name
      fields[`data${suffix}`] = examDate
      fields[`data_urm${suffix}`] = nextDueDate
      fields[`recomandari${suffix}`] =
        examination.verdictConditions ?? examination.recommendations ?? ''
      fields[`apt${suffix}`] = verdict === 'apt'
      fields[`apt_cond${suffix}`] = verdict === 'apt_conditionat'
      fields[`inapt_temp${suffix}`] = verdict === 'inapt_temporar'
      fields[`inapt${suffix}`] = verdict === 'inapt'
      for (const cb of ['tip_Angaja', 'tip_Examen', 'tip_Adapta', 'tip_Reluar', 'tip_Suprav', 'tip_Altele']) {
        fields[`${cb}${suffix}`] = false
      }
      fields[`${typeCheckField}${suffix}`] = true
    }
  } else if (docKey === 'examen_angajare') {
    fields = {
      nume_angajat: `${examination.employee.lastName} ${examination.employee.firstName}`,
      nr_dosar: examination.examinationNumber,
      data_top: examDate,
      inaltime: str(vs.height),
      greutate: str(vs.weight),
      imc: str(vs.bmi),
      ta: vs.bpSystolic ? `${vs.bpSystolic}/${vs.bpDiastolic}` : '',
      av: str(vs.pulse),
      av_vod: str(vt.right),
      av_vos: str(vt.left),
      av_corectie: str(vt.withCorrection),
      vap_vod: str(vt.nearRight),
      vap_vos: str(vt.nearLeft),
      concl_text: examination.clinicalFindings ?? '',
      spec_text: examination.clinicalFindings ?? '',
      recomandari: examination.recommendations ?? '',
      aviz_functie: examination.employee.jobTitle ?? '',
      data_exam: examDate,
      data_urmator: nextDueDate,
      apt: verdict === 'apt',
      apt_cond: verdict === 'apt_conditionat',
      inapt_temp: verdict === 'inapt_temporar',
      inapt: verdict === 'inapt',
    }
  } else if (docKey === 'examen_periodic') {
    fields = {
      p_nume_angajat: `${examination.employee.lastName} ${examination.employee.firstName}`,
      p_nr_dosar: examination.examinationNumber,
      p_data_top: examDate,
      p_inaltime: str(vs.height),
      p_greutate: str(vs.weight),
      p_imc: str(vs.bmi),
      p_ta: vs.bpSystolic ? `${vs.bpSystolic}/${vs.bpDiastolic}` : '',
      p_av: str(vs.pulse),
      p_av_vod: str(vt.right),
      p_av_vos: str(vt.left),
      p_av_corectie: str(vt.withCorrection),
      p_vap_vod: str(vt.nearRight),
      p_vap_vos: str(vt.nearLeft),
      p_concl_text: examination.clinicalFindings ?? '',
      p_spec_text: examination.clinicalFindings ?? '',
      p_recomandari: examination.recommendations ?? '',
      p_aviz_functie: examination.employee.jobTitle ?? '',
      p_data_exam: examDate,
      p_data_urmator: nextDueDate,
      p_apt: verdict === 'apt',
      p_apt_cond: verdict === 'apt_conditionat',
      p_inapt_temp: verdict === 'inapt_temporar',
      p_inapt: verdict === 'inapt',
    }
  } else if (docKey === 'dosar_medical') {
    const companyAddrDm = [
      examination.workplace.company.addressLine1,
      examination.workplace.company.city,
    ].filter(Boolean).join(', ')
    fields = {
      unitate: examination.workplace.company.name,
      punct_lucru: examination.workplace.name,
      adresa_unitate: companyAddrDm,
      nume: examination.employee.lastName,
      prenume: examination.employee.firstName,
      data_nasterii: examination.employee.birthDate
        ? formatDateRo(examination.employee.birthDate)
        : '',
      sex: examination.employee.gender ?? '',
      ocupatia: examination.employee.jobTitle ?? '',
    }
  } else if (docKey === 'bilet_trimitere') {
    const birthYear = examination.employee.birthDate
      ? new Date(examination.employee.birthDate).getFullYear()
      : null
    const age = birthYear !== null ? String(new Date().getFullYear() - birthYear) : ''
    fields = {
      nume: examination.employee.lastName,
      prenume: examination.employee.firstName,
      varsta: age,
      data_nasterii: examination.employee.birthDate
        ? formatDateRo(examination.employee.birthDate)
        : '',
      cnp: examination.employee.idDocumentNumber ?? '',
      sex: examination.employee.gender ?? '',
      data_trimiterii: formatDateRo(new Date()),
      motivul_trimiterii: examination.notes ?? '',
    }
  } else if (docKey === 'adeverinta') {
    fields = {
      cnp: examination.employee.idDocumentNumber ?? '',
      nume: examination.employee.lastName,
      prenume: examination.employee.firstName,
      sex: examination.employee.gender ?? '',
      societatea: examination.workplace.company.name,
      recomandari: examination.recommendations ?? '',
      data_elib: formatDateRo(new Date()),
    }
  } else if (docKey === 'certificat_invatamant') {
    fields = {
      nr_cert: examination.examinationNumber,
      data_cert: examDate,
      nume: examination.employee.lastName,
      prenume: examination.employee.firstName,
      cnp: examination.employee.idDocumentNumber ?? '',
      apt: verdict === 'apt',
      inapt: verdict === 'inapt',
    }
  } else if (docKey === 'certificat_magistratura') {
    fields = {
      nr_cert: examination.examinationNumber,
      data_cert: examDate,
      nume: examination.employee.lastName,
      prenume: examination.employee.firstName,
      cnp: examination.employee.idDocumentNumber ?? '',
      apt: verdict === 'apt',
      inapt: verdict === 'inapt',
      apt_cond: verdict === 'apt_conditionat',
      inapt_temp: verdict === 'inapt_temporar',
      recomandari: examination.recommendations ?? '',
    }
  } else if (docKey === 'raport_maternitate') {
    const fullName = `${examination.employee.lastName} ${examination.employee.firstName}`
    fields = {
      nr_raport: examination.examinationNumber,
      data_raport: examDate,
      salariata_1: fullName,
      salariata_2: fullName,
    }
  } else if (docKey === 'informare_maternitate') {
    fields = {
      nr_inf: examination.examinationNumber,
      data_inf: examDate,
      inf_nume: examination.employee.lastName,
      inf_prenume: examination.employee.firstName,
      inf_cnp: examination.employee.idDocumentNumber ?? '',
    }
  }

  let buffer: Uint8Array
  try {
    buffer = await fillExaminationPdf(doc.templateFile, fields)
  } catch (err) {
    console.error('[documents] pdf fill failed', err)
    return NextResponse.json(
      { error: 'pdf_fill_failed', message: String(err) },
      { status: 500 }
    )
  }

  const safeName = `${examination.employee.lastName}_${examination.employee.firstName}`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
  const filename = `${doc.key}_${safeName}_${examination.examinationNumber.replace('/', '-')}.pdf`

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function formatDateRo(date: Date): string {
  return new Intl.DateTimeFormat('ro-RO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}
