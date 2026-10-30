import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeEmployeeFieldUpdates, type ExistingEmployeeValues } from './import-update'

const EMPTY_EXISTING: ExistingEmployeeValues = {
  companyEmployeeId: null,
  jobTitle: null,
  email: null,
  phone: null,
  city: null,
  notes: null,
  employerRequirements: null,
}

test('non-empty, different values are written', () => {
  const { data, changed, changes } = computeEmployeeFieldUpdates(
    { ...EMPTY_EXISTING, jobTitle: 'ȘOFER' },
    { jobTitle: 'INCASATOR CITITOR' }
  )
  assert.equal(data.jobTitle, 'INCASATOR CITITOR')
  assert.deepEqual(changed, ['jobTitle'])
  assert.deepEqual(changes.jobTitle, { old: 'ȘOFER', new: 'INCASATOR CITITOR' })
})

test('an empty cell never erases an existing value (hard rule)', () => {
  const existing = { ...EMPTY_EXISTING, email: 'tamas.anton@example.com' }
  for (const blank of [null, undefined, '', '   ']) {
    const { data, changed } = computeEmployeeFieldUpdates(existing, { email: blank })
    assert.deepEqual(data, {}, `blank=${JSON.stringify(blank)} must not change data`)
    assert.deepEqual(changed, [])
  }
})

test('identical values produce no change (idempotent re-import)', () => {
  const existing: ExistingEmployeeValues = {
    companyEmployeeId: '12345',
    jobTitle: 'INCASATOR CITITOR',
    email: 'a@b.ro',
    phone: '0712345678',
    city: 'Deva',
    notes: 'tura noapte',
    employerRequirements: null,
  }
  const { data, changed } = computeEmployeeFieldUpdates(existing, {
    companyEmployeeId: '12345',
    jobTitle: 'INCASATOR CITITOR',
    email: 'a@b.ro',
    phone: '0712345678',
    city: 'Deva',
    notes: 'tura noapte',
  })
  assert.deepEqual(data, {})
  assert.deepEqual(changed, [])
})

test('only differing fields are included; filling a blank field counts as a change', () => {
  const existing: ExistingEmployeeValues = {
    companyEmployeeId: '111',
    jobTitle: 'Operator',
    email: null,
    phone: null,
    city: 'Deva',
    notes: null,
    employerRequirements: null,
  }
  const { data, changed } = computeEmployeeFieldUpdates(existing, {
    companyEmployeeId: '111', // same → skipped
    jobTitle: 'Operator principal', // changed
    email: 'nou@example.com', // null → value → changed
    city: 'Deva', // same → skipped
  })
  assert.deepEqual(data, { jobTitle: 'Operator principal', email: 'nou@example.com' })
  assert.deepEqual(changed.sort(), ['email', 'jobTitle'])
})

test('surrounding whitespace is ignored when comparing', () => {
  const { data, changed } = computeEmployeeFieldUpdates(
    { ...EMPTY_EXISTING, city: 'Deva' },
    { city: '  Deva  ' }
  )
  assert.deepEqual(data, {})
  assert.deepEqual(changed, [])
})

test('employerRequirements updates in place, but an empty cell never erases it', () => {
  // A non-empty value is written.
  const set = computeEmployeeFieldUpdates(
    { ...EMPTY_EXISTING, employerRequirements: null },
    { employerRequirements: 'MUNCA IN TURE DE NOAPTE' }
  )
  assert.equal(set.data.employerRequirements, 'MUNCA IN TURE DE NOAPTE')
  assert.deepEqual(set.changed, ['employerRequirements'])

  // A blank cell leaves the stored value untouched (hard rule).
  const existing = { ...EMPTY_EXISTING, employerRequirements: 'CU ATRIBUTII COND. AUTO CAT B' }
  for (const blank of [null, undefined, '', '   ']) {
    const { data, changed } = computeEmployeeFieldUpdates(existing, { employerRequirements: blank })
    assert.deepEqual(data, {})
    assert.deepEqual(changed, [])
  }
})
