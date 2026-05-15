/**
 * Demo cabinet seeder.
 *
 * Populates a freshly-created tenant with realistic fake data so a
 * practitioner arriving via a demo invitation sees a cabinet that
 * looks like it has been running for several months — not an empty
 * shell.
 *
 * What gets created:
 *   - 1 default Location (the cabinet's address)
 *   - 3 Companies with workplaces (metal fabrication, office, construction)
 *   - 14 Employees distributed across the companies
 *   - 7 ExaminationTypes (from the HG 355/2007 seed) referenced by ID
 *   - 9 signed Examinations (various verdicts, dates spread over 6 months)
 *   - 2 pending Recalls (one overdue, one due this week)
 *   - 1 scheduled Examination (created from a recall)
 *
 * The practitioner invited to the demo tenant appears as the signatory
 * on historical examinations, making the data feel personal.
 *
 * All names/CUIs are clearly fictional. No real personal data.
 */

import type { PrismaClient } from '@prisma/client'

// ─── Fake data ───────────────────────────────────────────────────────

const COMPANIES = [
  {
    name: 'SC Metalo Construct SRL',
    cui: 'RO12345678',
    city: 'Cluj-Napoca',
    workplaces: [
      { name: 'Atelier sudură', department: 'Producție', hazards: ['noise', 'fumes'] },
      { name: 'Depozit materiale', department: 'Logistică', hazards: [] },
    ],
  },
  {
    name: 'SC Birou Modern SA',
    cui: 'RO23456789',
    city: 'Cluj-Napoca',
    workplaces: [
      { name: 'Birou administrativ', department: 'Administrație', hazards: [] },
      { name: 'Departament IT', department: 'Tehnologie', hazards: [] },
    ],
  },
  {
    name: 'SC Construct Plus SRL',
    cui: 'RO34567890',
    city: 'Florești',
    workplaces: [
      { name: 'Șantier construcții', department: 'Execuție', hazards: ['height', 'noise'] },
      { name: 'Birou tehnic', department: 'Proiectare', hazards: [] },
    ],
  },
]

const EMPLOYEES = [
  { firstName: 'Ion', lastName: 'Popescu', gender: 'M', birthYear: 1978 },
  { firstName: 'Maria', lastName: 'Ionescu', gender: 'F', birthYear: 1985 },
  { firstName: 'Gheorghe', lastName: 'Constantin', gender: 'M', birthYear: 1972 },
  { firstName: 'Elena', lastName: 'Dumitrescu', gender: 'F', birthYear: 1990 },
  { firstName: 'Vasile', lastName: 'Stan', gender: 'M', birthYear: 1968 },
  { firstName: 'Andreea', lastName: 'Popa', gender: 'F', birthYear: 1995 },
  { firstName: 'Mihai', lastName: 'Radu', gender: 'M', birthYear: 1980 },
  { firstName: 'Cristina', lastName: 'Stoica', gender: 'F', birthYear: 1987 },
  { firstName: 'Alexandru', lastName: 'Marin', gender: 'M', birthYear: 1975 },
  { firstName: 'Ioana', lastName: 'Dinu', gender: 'F', birthYear: 1992 },
  { firstName: 'Florin', lastName: 'Niculae', gender: 'M', birthYear: 1983 },
  { firstName: 'Adriana', lastName: 'Gheorghiu', gender: 'F', birthYear: 1971 },
  { firstName: 'Bogdan', lastName: 'Vlad', gender: 'M', birthYear: 1988 },
  { firstName: 'Simona', lastName: 'Moldovan', gender: 'F', birthYear: 1994 },
]

// Verdicts to cycle through for signed examinations
const VERDICTS = [
  'apt',
  'apt',
  'apt',
  'apt',
  'apt',
  'apt_conditionat',
  'apt_conditionat',
  'apt',
  'inapt_temporar',
] as const

function monthsAgo(n: number): Date {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d
}

function daysFromNow(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

/**
 * Main entry point. Call after creating the tenant and the practitioner user.
 * Returns a summary of what was created.
 */
export async function seedDemoTenant(
  prisma: PrismaClient,
  tenantId: string,
  practitionerUserId: string
): Promise<{ companies: number; employees: number; examinations: number; recalls: number }> {

  // 1. Fetch the periodic examination type ID (we use the first available
  //    active type — the types are seeded globally in HG355 seed)
  const examTypes = await prisma.examinationType.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
    take: 4,
  })
  const periodicTypeId = examTypes[0]?.id
  const hiringTypeId = examTypes[1]?.id ?? examTypes[0]?.id
  if (!periodicTypeId) {
    console.warn('[demo-seed] No examination types found — skipping examinations')
  }

  // 2. Create a location
  const location = await prisma.location.create({
    data: {
      tenantId,
      name: 'Sediu principal',
      addressLine1: 'Str. Exemplu nr. 1',
      city: 'Cluj-Napoca',
      county: 'Cluj',
      isActive: true,
    },
    select: { id: true },
  })

  // 3. Create companies and workplaces
  const createdWorkplaces: Array<{ id: string; companyId: string }> = []
  const createdCompanyIds: string[] = []

  for (const companyDef of COMPANIES) {
    const company = await prisma.company.create({
      data: {
        tenantId,
        name: companyDef.name,
        cui: companyDef.cui,
        city: companyDef.city,
        isActive: true,
      },
      select: { id: true },
    })
    createdCompanyIds.push(company.id)

    for (const wpDef of companyDef.workplaces) {
      const wp = await prisma.workplace.create({
        data: {
          tenantId,
          companyId: company.id,
          name: wpDef.name,
          department: wpDef.department,
          examinationIntervalMonths: 12,
          isActive: true,
          riskProfile: { hazards: wpDef.hazards },
        },
        select: { id: true },
      })
      createdWorkplaces.push({ id: wp.id, companyId: company.id })
    }
  }

  // 4. Create employees and assign them to workplaces
  const createdEmployeeIds: string[] = []

  for (let i = 0; i < EMPLOYEES.length; i++) {
    const empDef = EMPLOYEES[i]
    const workplace = createdWorkplaces[i % createdWorkplaces.length]

    const emp = await prisma.employee.create({
      data: {
        tenantId,
        firstName: empDef.firstName,
        lastName: empDef.lastName,
        gender: empDef.gender,
        birthDate: new Date(empDef.birthYear, 5, 15),
        idDocumentType: 'other',
        nationality: 'RO',
        isActive: true,
      },
      select: { id: true },
    })
    createdEmployeeIds.push(emp.id)

    await prisma.employeeWorkplaceAssignment.create({
      data: {
        tenantId,
        employeeId: emp.id,
        workplaceId: workplace.id,
        startDate: monthsAgo(8),
        isCurrent: true,
        reason: 'hired',
      },
    })
  }

  // 5. Create signed examinations (historical data)
  if (!periodicTypeId) {
    return {
      companies: COMPANIES.length,
      employees: EMPLOYEES.length,
      examinations: 0,
      recalls: 0,
    }
  }

  let examinationSequence = 0
  const year = new Date().getFullYear()
  const createdExaminationIds: string[] = []
  const recallsCreated: string[] = []

  for (let i = 0; i < 9; i++) {
    examinationSequence++
    const employeeId = createdEmployeeIds[i]
    const workplaceIdx = i % createdWorkplaces.length
    const workplace = createdWorkplaces[workplaceIdx]
    const verdict = VERDICTS[i]
    const createdMonthsAgo = 6 - Math.floor(i * 0.6)
    const examDate = monthsAgo(createdMonthsAgo)
    const examinationNumber = `${year}/${String(examinationSequence).padStart(4, '0')}`
    const typeId = i < 3 ? hiringTypeId : periodicTypeId

    const nextDue =
      verdict === 'apt' || verdict === 'apt_conditionat'
        ? new Date(examDate.getTime() + 365 * 24 * 60 * 60 * 1000)
        : null

    const exam = await prisma.examination.create({
      data: {
        tenantId,
        employeeId,
        workplaceId: workplace.id,
        examinationTypeId: typeId,
        practitionerId: practitionerUserId,
        locationId: location.id,
        examinationNumber,
        examinationYear: year,
        examinationSequence,
        status: 'completed',
        requestSource: i < 3 ? 'employer_request' : 'periodic_due',
        verdict,
        verdictConditions:
          verdict === 'apt_conditionat'
            ? 'Control periodic la 6 luni. Fără expunere prelungită la zgomot.'
            : null,
        inaptTemporarUntil:
          verdict === 'inapt_temporar' ? daysFromNow(30) : null,
        clinicalFindings: 'Examen clinic în limite normale.',
        vitalSigns: {
          height: 168 + (i % 20),
          weight: 70 + (i % 25),
          bpSystolic: 120 + (i % 10),
          bpDiastolic: 80 + (i % 5),
          pulse: 72 + (i % 8),
        },
        scheduledAt: examDate,
        completedAt: examDate,
        signedAt: examDate,
        signedByUserId: practitionerUserId,
        nextExaminationDueDate: nextDue,
      },
      select: { id: true },
    })
    createdExaminationIds.push(exam.id)

    // Create a Recall for apt examinations with future due dates
    if (nextDue && (verdict === 'apt' || verdict === 'apt_conditionat')) {
      const recallStatus = nextDue < new Date() ? 'overdue' : 'pending'
      const recall = await prisma.recall.create({
        data: {
          tenantId,
          employeeId,
          workplaceId: workplace.id,
          examinationTypeId: typeId,
          createdFromExaminationId: exam.id,
          dueDate: nextDue,
          status: recallStatus,
          notificationCount: 0,
        },
        select: { id: true },
      })
      recallsCreated.push(recall.id)
    }
  }

  // 6. Create one scheduled examination (visible in "Programate" tab)
  examinationSequence++
  const scheduledEmpId = createdEmployeeIds[9]
  const scheduledWp = createdWorkplaces[0]
  await prisma.examination.create({
    data: {
      tenantId,
      employeeId: scheduledEmpId,
      workplaceId: scheduledWp.id,
      examinationTypeId: periodicTypeId,
      practitionerId: practitionerUserId,
      locationId: location.id,
      examinationNumber: `${year}/${String(examinationSequence).padStart(4, '0')}`,
      examinationYear: year,
      examinationSequence,
      status: 'scheduled',
      requestSource: 'periodic_due',
      scheduledAt: daysFromNow(3),
    },
  })

  return {
    companies: COMPANIES.length,
    employees: EMPLOYEES.length,
    examinations: examinationSequence,
    recalls: recallsCreated.length,
  }
}
