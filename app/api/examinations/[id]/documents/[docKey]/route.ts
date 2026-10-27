import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getApiUser } from '@/lib/auth'
import { canReadTenantData, canViewSensitivePii } from '@/lib/permissions/tenant-data'
import { resolveEmployeeCnp } from '@/lib/employees/resolve-cnp'
import { writeAuditLog, getRequestMeta } from '@/lib/audit/log'
import { EXAM_TYPE_DOCUMENTS } from '@/lib/examinations/document-templates'
import { fillExaminationPdf } from '@/lib/examinations/pdf-fill'
import { resolveExaminationDate } from '@/lib/examinations/examined-at'
import { buildClinicalSheetFields } from '@/lib/examinations/clinical-exam'
import { buildDosarFields } from '@/lib/examinations/dosar-medical'

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
          id: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          gender: true,
          idDocumentType: true,
          idDocumentNumber: true,
          cnpEncrypted: true,
          jobTitle: true,
          addressLine1: true,
          city: true,
          phone: true,
          medicCurantName: true,
          disabilityDegree: true,
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

  // The CNP printed on the official forms. See resolveEmployeeCnp for why
  // reading idDocumentNumber alone (as this route used to) printed an empty
  // CNP for every Romanian worker. Gated on canViewSensitivePii, the same gate
  // as the employee detail view.
  const cnp = resolveEmployeeCnp(
    examination.employee,
    canViewSensitivePii(auth.user, auth.user.tenantId)
  )
  const cnpValue = cnp.value
  if (cnp.error) {
    console.error('[documents] CNP decryption failed', {
      examinationId: id,
      employeeId: examination.employee.id,
    })
  }
  // Decrypting a CNP is a PII access; record it the same way the employee
  // detail route does, so the audit log shows who pulled a worker's CNP onto
  // a document and when.
  if (cnp.decrypted) {
    const { ipAddress, userAgent } = getRequestMeta(_req)
    void writeAuditLog({
      tenantId: auth.user.tenantId,
      userId: auth.user.id,
      action: 'read',
      entityType: 'employee',
      entityId: examination.employee.id,
      entitySummary: `${examination.employee.lastName} ${examination.employee.firstName}`,
      changes: { cnpDecrypted: true, document: docKey },
      ipAddress,
      userAgent,
    })
  }

  const vs = (examination.vitalSigns ?? {}) as Record<string, unknown>
  const vt = (examination.visionTest ?? {}) as Record<string, unknown>
  const ht = (examination.hearingTest ?? {}) as Record<string, unknown>
  const an = (examination.anamnesis ?? {}) as Record<string, unknown>
  const at = (examination.additionalTests ?? {}) as Record<string, unknown>
  const ce = (examination.clinicalExam ?? {}) as Record<string, unknown>
  const str = (v: unknown): string =>
    v !== null && v !== undefined && v !== '' ? String(v) : ''
  // Same date the fișă page and fisa-pdf print — these templates include
  // fisa_aptitudine itself, so computing it differently here would make the
  // official form disagree with the other two renderings of the same fact.
  const examDate = formatDateRo(resolveExaminationDate(examination))
  // Short numeric form (15.01.2026) for narrow date boxes that can't fit the
  // long Romanian date — notably the periodic sheet's top-row `p_data_top`
  // (55pt), where the long form wraps across lines. Same locale/timezone as
  // formatDateRo so the day never drifts.
  const examDateShort = formatDateRoShort(resolveExaminationDate(examination))
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
      fields[`cnp${suffix}`] = cnpValue
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
      data_top: examDateShort,
      inaltime: str(vs.height),
      greutate: str(vs.weight),
      imc: str(vs.bmi),
      ta: vs.bpSystolic ? `${vs.bpSystolic}/${vs.bpDiastolic}` : '',
      av: str(vs.pulse),
      // spec_text keeps clinicalFindings (agrees with the fișă de aptitudine);
      // concl_text + vision + obesity + supplementary come from the builder.
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
    // Definition-driven fields, bare keys (no prefix) for the angajare sheet.
    Object.assign(
      fields,
      buildClinicalSheetFields({
        clinicalExam: ce,
        visionTest: vt,
        hearingTest: ht,
        anamnesis: an,
        additionalTests: at,
        vitalSigns: vs,
      })
    )
  } else if (docKey === 'examen_periodic') {
    // Static (non-definition) fields. Vitals TA/AV and the distance/near
    // vision, the systems-exam checkboxes/notes, obesity, asymptomatic,
    // supplementary exams, the clinical conclusion text (concl_text) and the
    // specialty conclusion are all derived from the clinical-exam definition
    // below and merged in with the `p_` prefix.
    fields = {
      p_nume_angajat: `${examination.employee.lastName} ${examination.employee.firstName}`,
      p_nr_dosar: examination.examinationNumber,
      p_data_top: examDateShort,
      p_inaltime: str(vs.height),
      p_greutate: str(vs.weight),
      p_imc: str(vs.bmi),
      p_ta: vs.bpSystolic ? `${vs.bpSystolic}/${vs.bpDiastolic}` : '',
      p_av: str(vs.pulse),
      // spec_text keeps the existing clinicalFindings so the fișă-de-aptitudine
      // renderings that read clinicalFindings stay in agreement. concl_text now
      // comes from clinicalExam.conclusionText (via the definition builder).
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
    // Definition-driven fields, prefixed with `p_` for the periodic sheet.
    const periodicFields = buildClinicalSheetFields({
      clinicalExam: ce,
      visionTest: vt,
      hearingTest: ht,
      anamnesis: an,
      additionalTests: at,
      vitalSigns: vs,
    })
    for (const [key, value] of Object.entries(periodicFields)) {
      fields[`p_${key}`] = value
    }
  } else if (docKey === 'dosar_medical') {
    // Every Dosar field is derived from the one definition. buildDosarFields
    // already collapses whitespace/newlines on each value (so a company name
    // with a newline no longer prints a stray line under "Nume" — the Robotoy
    // bug). cnpValue comes from resolveEmployeeCnp above (audited).
    const emp = examination.employee
    const birth = emp.birthDate
    const examWhen = resolveExaminationDate(examination)
    const varsta =
      birth != null
        ? String(
            examWhen.getFullYear() -
              new Date(birth).getFullYear() -
              (examWhen <
              new Date(examWhen.getFullYear(), new Date(birth).getMonth(), new Date(birth).getDate())
                ? 1
                : 0)
          )
        : ''
    fields = {
      sex: emp.gender ?? '',
      ...buildDosarFields({
        anamnesis: an,
        companyName: examination.workplace.company.name,
        workplaceName: examination.workplace.name,
        department: examination.workplace.department ?? '',
        companyAddress: [
          examination.workplace.company.addressLine1,
          examination.workplace.company.city,
        ]
          .filter(Boolean)
          .join(', '),
        lastName: emp.lastName,
        firstName: emp.firstName,
        varsta,
        dataNasterii: birth ? formatDateRo(birth) : '',
        cnp: cnpValue,
        employeeAddress: [emp.addressLine1, emp.city].filter(Boolean).join(', '),
        phone: emp.phone ?? '',
        jobTitle: emp.jobTitle ?? '',
        gender: emp.gender ?? null,
        disabilityDegree: emp.disabilityDegree ?? null,
        medicCurantName: emp.medicCurantName ?? null,
        familyHistory: str(an.familyHistory),
        allergies: str(an.allergies),
      }),
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
      cnp: cnpValue,
      sex: examination.employee.gender ?? '',
      data_trimiterii: formatDateRo(new Date()),
      motivul_trimiterii: examination.notes ?? '',
    }
  } else if (docKey === 'adeverinta') {
    fields = {
      cnp: cnpValue,
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
      cnp: cnpValue,
      apt: verdict === 'apt',
      inapt: verdict === 'inapt',
    }
  } else if (docKey === 'certificat_magistratura') {
    fields = {
      nr_cert: examination.examinationNumber,
      data_cert: examDate,
      nume: examination.employee.lastName,
      prenume: examination.employee.firstName,
      cnp: cnpValue,
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
      inf_cnp: cnpValue,
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

// Numeric 15.01.2026 form for narrow date boxes. Same locale/timezone as
// formatDateRo, so the two never disagree on which day they render.
function formatDateRoShort(date: Date): string {
  return new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}
