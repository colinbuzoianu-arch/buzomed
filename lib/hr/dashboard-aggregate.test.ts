import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aggregateHrDashboard,
  statusForRow,
  matchesTableFilter,
  type HrEmployeeRow,
} from './dashboard-aggregate'

// Fixed reference time: 2026-06-15T00:00:00Z.
const NOW = Date.UTC(2026, 5, 15)
const ALL = { companyId: 'all', workplaceId: 'all' } as const

function daysFromNow(n: number): string {
  return new Date(NOW + n * 24 * 60 * 60 * 1000).toISOString()
}

function row(overrides: Partial<HrEmployeeRow> & { id: string }): HrEmployeeRow {
  return {
    lastName: 'Test',
    firstName: 'Ion',
    jobTitle: null,
    companyId: 'c1',
    workplaceId: 'w1',
    workplaceName: 'Atelier',
    verdict: null,
    verdictKnown: false,
    source: 'none',
    dueDate: null,
    inaptTemporarUntil: null,
    hasScheduledRecall: false,
    ...overrides,
  }
}

test('status buckets by due date around now', () => {
  assert.equal(statusForRow(row({ id: 'a', dueDate: daysFromNow(-1) }), NOW), 'expired')
  assert.equal(statusForRow(row({ id: 'b', dueDate: daysFromNow(10) }), NOW), 'expiringSoon')
  assert.equal(statusForRow(row({ id: 'c', dueDate: daysFromNow(30) }), NOW), 'expiringSoon')
  assert.equal(statusForRow(row({ id: 'd', dueDate: daysFromNow(31) }), NOW), 'valid')
  assert.equal(statusForRow(row({ id: 'e', dueDate: null }), NOW), 'noExamination')
})

test('imported employee (recall, no exam) is dated, not "fără examen", and verdict unknown', () => {
  const imported = row({
    id: 'imp',
    source: 'recall',
    dueDate: daysFromNow(90),
    verdict: null,
    verdictKnown: false,
  })
  const res = aggregateHrDashboard([imported], ALL, NOW)
  assert.equal(res.summary.valid, 1)
  assert.equal(res.summary.noExamination, 0)
  // Counts into the grey "necunoscut" slice of avize, never as apt.
  assert.equal(res.avize.find((s) => s.key === 'necunoscut')?.value, 1)
  assert.equal(res.avize.find((s) => s.key === 'apt')?.value, 0)
})

test('employee with neither exam due date nor recall is "fără examen"', () => {
  const none = row({ id: 'n', source: 'none', dueDate: null })
  const res = aggregateHrDashboard([none], ALL, NOW)
  assert.equal(res.summary.noExamination, 1)
  assert.equal(res.alerts.noRecord, 1)
})

test('conformPct is valid / total', () => {
  const rows = [
    row({ id: '1', source: 'examination', dueDate: daysFromNow(60), verdict: 'apt', verdictKnown: true }),
    row({ id: '2', source: 'examination', dueDate: daysFromNow(60), verdict: 'apt', verdictKnown: true }),
    row({ id: '3', source: 'examination', dueDate: daysFromNow(-5), verdict: 'apt', verdictKnown: true }),
    row({ id: '4', source: 'none', dueDate: null }),
  ]
  const res = aggregateHrDashboard(rows, ALL, NOW)
  assert.equal(res.summary.total, 4)
  assert.equal(res.summary.valid, 2)
  assert.equal(res.summary.conformPct, 50)
})

test('avize counts only fișe still in force (valid/expiring), split by verdict', () => {
  const rows = [
    row({ id: '1', source: 'examination', dueDate: daysFromNow(60), verdict: 'apt', verdictKnown: true }),
    row({ id: '2', source: 'examination', dueDate: daysFromNow(10), verdict: 'apt_conditionat', verdictKnown: true }),
    // expired — excluded from avize even though verdict is known
    row({ id: '3', source: 'examination', dueDate: daysFromNow(-10), verdict: 'inapt', verdictKnown: true }),
    row({ id: '4', source: 'recall', dueDate: daysFromNow(40) }), // necunoscut
  ]
  const res = aggregateHrDashboard(rows, ALL, NOW)
  assert.equal(res.avize.find((s) => s.key === 'apt')?.value, 1)
  assert.equal(res.avize.find((s) => s.key === 'apt_conditionat')?.value, 1)
  assert.equal(res.avize.find((s) => s.key === 'inapt')?.value, 0)
  assert.equal(res.avize.find((s) => s.key === 'necunoscut')?.value, 1)
})

test('programări splits due-in-60-days by scheduled recall', () => {
  const rows = [
    row({ id: '1', source: 'examination', dueDate: daysFromNow(20), hasScheduledRecall: true }),
    row({ id: '2', source: 'examination', dueDate: daysFromNow(50), hasScheduledRecall: false }),
    // due beyond 60 days — excluded
    row({ id: '3', source: 'examination', dueDate: daysFromNow(120), hasScheduledRecall: false }),
  ]
  const res = aggregateHrDashboard(rows, ALL, NOW)
  assert.equal(res.programari.total, 2)
  assert.equal(res.programari.slices.find((s) => s.key === 'programat')?.value, 1)
  assert.equal(res.programari.slices.find((s) => s.key === 'neprogramat')?.value, 1)
})

test('byMonth has the expired bucket first, then 6 months from current', () => {
  const rows = [
    row({ id: 'e', source: 'examination', dueDate: daysFromNow(-3) }), // expired
    row({ id: 'm0', source: 'examination', dueDate: daysFromNow(5) }), // June 2026
    row({ id: 'm1', source: 'examination', dueDate: daysFromNow(40) }), // July 2026
  ]
  const res = aggregateHrDashboard(rows, ALL, NOW)
  assert.equal(res.byMonth.length, 7)
  assert.equal(res.byMonth[0].key, 'expired')
  assert.equal(res.byMonth[0].value, 1)
  assert.equal(res.byMonth[1].key, '2026-06')
  assert.equal(res.byMonth[1].value, 1)
  assert.equal(res.byMonth[2].key, '2026-07')
  assert.equal(res.byMonth[2].value, 1)
})

test('byWorkplace is sorted worst-first', () => {
  const rows = [
    row({ id: '1', workplaceId: 'good', workplaceName: 'Bun', source: 'examination', dueDate: daysFromNow(90) }),
    row({ id: '2', workplaceId: 'bad', workplaceName: 'Rău', source: 'examination', dueDate: daysFromNow(-5) }),
    row({ id: '3', workplaceId: 'bad', workplaceName: 'Rău', source: 'none', dueDate: null }),
  ]
  const res = aggregateHrDashboard(rows, ALL, NOW)
  assert.equal(res.byWorkplace[0].workplaceId, 'bad')
  assert.equal(res.byWorkplace[0].expired + res.byWorkplace[0].noExamination, 2)
})

test('header filter scopes by company and workplace', () => {
  const rows = [
    row({ id: '1', companyId: 'c1', workplaceId: 'w1', source: 'examination', dueDate: daysFromNow(90) }),
    row({ id: '2', companyId: 'c2', workplaceId: 'w2', source: 'examination', dueDate: daysFromNow(90) }),
  ]
  assert.equal(aggregateHrDashboard(rows, { companyId: 'c1', workplaceId: 'all' }, NOW).summary.total, 1)
  assert.equal(aggregateHrDashboard(rows, { companyId: 'all', workplaceId: 'w2' }, NOW).summary.total, 1)
})

test('inapt temporar ending soon alert fires within 14 days', () => {
  const rows = [
    row({
      id: '1',
      source: 'examination',
      dueDate: daysFromNow(90),
      verdict: 'inapt_temporar',
      verdictKnown: true,
      inaptTemporarUntil: daysFromNow(10),
    }),
    row({
      id: '2',
      source: 'examination',
      dueDate: daysFromNow(90),
      verdict: 'inapt_temporar',
      verdictKnown: true,
      inaptTemporarUntil: daysFromNow(40),
    }),
  ]
  const res = aggregateHrDashboard(rows, ALL, NOW)
  assert.equal(res.alerts.inaptTemporar, 2)
  assert.equal(res.alerts.inaptTemporarEndingSoon, 1)
})

test('expiring-in-7-days-without-schedule alert', () => {
  const rows = [
    row({ id: '1', source: 'examination', dueDate: daysFromNow(5), hasScheduledRecall: false }),
    row({ id: '2', source: 'examination', dueDate: daysFromNow(5), hasScheduledRecall: true }),
  ]
  const res = aggregateHrDashboard(rows, ALL, NOW)
  assert.equal(res.alerts.expiring7NoSchedule, 1)
})

test('table filter predicate matches the chart drill-downs', () => {
  const r = {
    ...row({ id: '1', source: 'examination', dueDate: daysFromNow(5), verdict: 'apt', verdictKnown: true }),
    status: 'expiringSoon' as const,
  }
  assert.equal(matchesTableFilter(r, { type: 'status', value: 'expiringSoon' }, NOW), true)
  assert.equal(matchesTableFilter(r, { type: 'status', value: 'valid' }, NOW), false)
  assert.equal(matchesTableFilter(r, { type: 'avize', value: 'apt' }, NOW), true)
  assert.equal(matchesTableFilter(r, { type: 'expiring7NoSchedule' }, NOW), true)
  assert.equal(matchesTableFilter(r, { type: 'month', value: '2026-06' }, NOW), true)
})
