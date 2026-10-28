/**
 * Scripted Iris answers for the sandbox — no AI. Each suggested question has a
 * pre-written Romanian answer computed deterministically from the fixtures, so
 * the demo's assistant reflects the same data the rest of the pages show.
 */

import { employeeName } from './aggregates'
import { companyCompliance } from './reports'
import type { SandboxData } from './types'

export interface IrisQA {
  id: string
  question: string
  answer: string
}

export const IRIS_FREE_TEXT_REPLY =
  'În demo răspund doar la întrebările sugerate. În versiunea completă, Iris lucrează cu datele cabinetului dumneavoastră.'

function overdueAnswer(data: SandboxData): string {
  const overdue = data.recalls.filter((r) => r.status === 'overdue')
  const empById = new Map(data.employees.map((e) => [e.id, e]))
  const names = overdue
    .slice(0, 3)
    .map((r) => {
      const e = empById.get(r.employeeId)
      return e ? employeeName(e) : null
    })
    .filter(Boolean)
  const n = overdue.length
  if (n === 0) return 'Momentan niciun angajat nu are controlul medical depășit. 👍'
  const list = names.length
    ? ` Printre ei: ${names.join(', ')}${n > names.length ? ' ș.a.' : ''}.`
    : ''
  return `${n} angajați au controlul medical periodic depășit.${list} Îi găsiți în Examinări › Scadențe, filtrați pe „Depășite".`
}

function lowestCoverageAnswer(data: SandboxData): string {
  const rows = companyCompliance(data)
    .filter((c) => c.coverage != null)
    .sort((a, b) => (a.coverage ?? 0) - (b.coverage ?? 0))
  if (rows.length === 0) return 'Nu există încă date de acoperire.'
  const worst = rows.slice(0, 3)
  const lines = worst.map(
    (c) => `• ${c.companyName} — ${c.coverage}% (${c.valid}/${c.total} fișe valide)`
  )
  return `Cele mai mici acoperiri sunt:\n${lines.join('\n')}\n\nRecomand prioritizarea programărilor la ${worst[0].companyName}.`
}

function noiseInvestigationsAnswer(): string {
  return [
    'Pentru expunere la zgomot profesional, investigațiile uzuale sunt:',
    '• Audiogramă tonală — obligatorie',
    '• Examen ORL de specialitate',
    '• Examen clinic general',
    '',
    'Periodicitatea și pragurile se raportează la HG 493/2006 privind zgomotul la locul de muncă.',
  ].join('\n')
}

function heroSummaryAnswer(data: SandboxData): string {
  const exam = data.examinations.find((e) => e.id === data.heroExaminationId)
  if (!exam) return 'Nu am găsit examinarea.'
  const emp = data.employees.find((e) => e.id === exam.employeeId)
  const type = data.examinationTypes.find((t) => t.id === exam.examinationTypeId)
  const vs = exam.vitalSigns as Record<string, unknown>
  const vitals =
    vs.height && vs.weight
      ? ` Parametri: ${vs.height} cm, ${vs.weight} kg, IMC ${vs.bmi}, TA ${vs.bpSystolic}/${vs.bpDiastolic} mmHg, puls ${vs.pulse}.`
      : ''
  return `${emp ? employeeName(emp) : 'Angajatul'} — ${type?.nameRo ?? 'examinare'}, în curs (pasul 2 din 4).${vitals} Fără aviz emis încă; următorul pas este examenul clinic pe aparate.`
}

function todayAnswer(data: SandboxData): string {
  const start = new Date(data.now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(data.now)
  end.setHours(23, 59, 59, 999)
  const empById = new Map(data.employees.map((e) => [e.id, e]))
  const todays = data.examinations
    .filter(
      (e) =>
        (e.status === 'scheduled' || e.status === 'in_progress') &&
        e.scheduledAt &&
        e.scheduledAt >= start &&
        e.scheduledAt <= end
    )
    .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())
  if (todays.length === 0) return 'Nu aveți programări astăzi.'
  const lines = todays.slice(0, 8).map((e) => {
    const emp = empById.get(e.employeeId)
    const time = e.scheduledAt
      ? `${String(e.scheduledAt.getHours()).padStart(2, '0')}:${String(e.scheduledAt.getMinutes()).padStart(2, '0')}`
      : '—'
    const flag = e.status === 'in_progress' ? ' (în curs)' : ''
    return `• ${time} — ${emp ? employeeName(emp) : '—'}${flag}`
  })
  const inProgress = todays.filter((e) => e.status === 'in_progress').length
  return `Aveți ${todays.length} programări astăzi${inProgress ? `, din care ${inProgress} în curs` : ''}:\n${lines.join('\n')}`
}

export function buildIrisQA(data: SandboxData): IrisQA[] {
  const heroEmp = data.employees.find(
    (e) => e.id === data.examinations.find((x) => x.id === data.heroExaminationId)?.employeeId
  )
  const heroName = heroEmp ? `${heroEmp.lastName} ${heroEmp.firstName}` : 'angajatul în curs'
  return [
    { id: 'overdue', question: 'Câți angajați au controlul depășit?', answer: overdueAnswer(data) },
    {
      id: 'coverage',
      question: 'Ce firme au cea mai mică acoperire?',
      answer: lowestCoverageAnswer(data),
    },
    {
      id: 'noise',
      question: 'Ce investigații recomanzi pentru zgomot?',
      answer: noiseInvestigationsAnswer(),
    },
    {
      id: 'summary',
      question: `Rezumă examinarea lui ${heroName}`,
      answer: heroSummaryAnswer(data),
    },
    { id: 'today', question: 'Pregătește-mi ziua de azi', answer: todayAnswer(data) },
  ]
}
