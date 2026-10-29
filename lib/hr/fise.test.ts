import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildFiseWhere,
  companyVisibleToHr,
  toFiseListRow,
  fiseFileName,
  type ExaminationForFiseList,
} from './fise'

const scope = {
  ok: true as const,
  tenantId: 'tenant-A',
  companyIds: ['company-A1', 'company-A2'],
  companies: [
    { id: 'company-A1', name: 'A1', city: null },
    { id: 'company-A2', name: 'A2', city: null },
  ],
}

test('company isolation: a company outside the scope is never visible', () => {
  assert.equal(companyVisibleToHr('company-A1', scope), true)
  assert.equal(companyVisibleToHr('company-B', scope), false)
  // Even a requested company must also be one of the user's.
  assert.equal(companyVisibleToHr('company-A1', scope, 'company-A2'), false)
  assert.equal(companyVisibleToHr('company-A1', scope, 'company-A1'), true)
})

test('buildFiseWhere forces scope + signed + published; a forged company id falls back to scope', () => {
  const where = buildFiseWhere(scope, { companyId: 'company-B' })
  // Signed only, never drafts.
  assert.deepEqual(where.signedAt, { not: null })
  assert.equal(where.deletedAt, null)
  const company = (where.workplace as { company: Record<string, unknown> }).company
  // company-B was ignored because it isn't in scope — restricted to scope ids.
  assert.deepEqual(company.id, { in: ['company-A1', 'company-A2'] })
  assert.equal(company.publishFiseToHrPortal, true)
})

test('buildFiseWhere narrows to a requested in-scope company', () => {
  const where = buildFiseWhere(scope, { companyId: 'company-A2' })
  const company = (where.workplace as { company: Record<string, unknown> }).company
  assert.equal(company.id, 'company-A2')
})

test('buildFiseWhere applies workplace, verdict, type, search and date range', () => {
  const where = buildFiseWhere(scope, {
    workplaceId: 'wp-1',
    verdict: 'apt',
    examinationTypeId: 'type-1',
    search: 'pop ion',
    from: '2026-01-01',
    to: '2026-06-30',
  })
  assert.equal((where.workplace as { id?: string }).id, 'wp-1')
  assert.equal(where.verdict, 'apt')
  assert.equal(where.examinationTypeId, 'type-1')
  // Each search term becomes an AND clause on first/last name.
  assert.equal(Array.isArray(where.AND), true)
  assert.equal((where.AND as unknown[]).length, 2)
  // Date range matches examinedAt, else completedAt.
  assert.equal(Array.isArray(where.OR), true)
  assert.equal((where.OR as unknown[]).length, 2)
})

function examRow(overrides: Partial<ExaminationForFiseList> = {}): ExaminationForFiseList {
  return {
    id: 'exam-1',
    examinationNumber: '2026/0007',
    verdict: 'apt_conditionat',
    nextExaminationDueDate: new Date('2027-03-01T00:00:00Z'),
    examinedAt: new Date('2026-03-01T00:00:00Z'),
    completedAt: new Date('2026-03-02T00:00:00Z'),
    createdAt: new Date('2026-03-02T00:00:00Z'),
    revokedAt: null,
    employee: { firstName: 'Ion', lastName: 'Popescu', jobTitle: 'Sudor' },
    workplace: { id: 'wp-1', name: 'Hala A', companyId: 'company-A1' },
    examinationType: { code: 'control_periodic', nameRo: 'Control periodic' },
    supersededBy: null,
    ...overrides,
  } as ExaminationForFiseList
}

test('toFiseListRow maps only fișă-printed fields and carries no clinical data', () => {
  const row = toFiseListRow(examRow())
  assert.equal(row.examinationNumber, '2026/0007')
  assert.equal(row.companyId, 'company-A1')
  assert.equal(row.verdict, 'apt_conditionat')
  assert.equal(row.examDate.slice(0, 10), '2026-03-01') // examinedAt wins
  assert.equal(row.isRevoked, false)
  // No clinical fields present on the row at all.
  const keys = Object.keys(row)
  for (const forbidden of ['anamnesis', 'diagnoses', 'clinicalFindings', 'recommendations', 'revocationReason', 'vitalSigns']) {
    assert.equal(keys.includes(forbidden), false, `row must not expose ${forbidden}`)
  }
})

test('toFiseListRow surfaces revocation + replacement number', () => {
  const row = toFiseListRow(
    examRow({ revokedAt: new Date('2026-04-01T00:00:00Z'), supersededBy: { examinationNumber: '2026/0019' } })
  )
  assert.equal(row.isRevoked, true)
  assert.equal(row.replacementNumber, '2026/0019')
})

test('fiseFileName strips diacritics and spaces', () => {
  const name = fiseFileName({
    lastName: 'Ioniță',
    firstName: 'Ștefan Andrei',
    examinationNumber: '2026/0007',
    examDate: '2026-03-01T00:00:00Z',
  })
  assert.equal(name, 'Ionita_Stefan_Andrei_2026-0007_2026-03-01.pdf')
})
