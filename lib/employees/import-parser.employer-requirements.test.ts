import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseImportFile } from './import-parser'

/**
 * The "Cerințe angajator" column must be detected as its own column and must
 * NOT be swallowed by `notes` ("mentiuni"). Exact-match wins, so "Mentiuni
 * aviz" lands in employerRequirements while a plain "Mentiuni" stays notes.
 */

test('"Cerinte angajator" maps to employerRequirements and carries the value', async () => {
  const csv = ['Nume,Prenume,Cerinte angajator', 'Pop,Ion,MUNCA IN TURE DE NOAPTE'].join('\n')
  const { mapping, rows } = await parseImportFile({ text: csv })
  assert.equal(mapping.detected.employerRequirements, 'Cerinte angajator')
  assert.equal(rows[0].employerRequirements, 'MUNCA IN TURE DE NOAPTE')
})

test('"Specificatii apt." maps to employerRequirements', async () => {
  const csv = ['Nume,Prenume,Specificatii apt.', 'Pop,Ion,IN RETEAUA DE APA POTABILA'].join('\n')
  const { mapping } = await parseImportFile({ text: csv })
  assert.equal(mapping.detected.employerRequirements, 'Specificatii apt.')
})

test('plain "Mentiuni" stays notes; "Mentiuni aviz" becomes employerRequirements', async () => {
  const csv = [
    'Nume,Prenume,Mentiuni,Mentiuni aviz',
    'Pop,Ion,observatie interna,CU ATRIBUTII COND. AUTO CAT B',
  ].join('\n')
  const { mapping, rows } = await parseImportFile({ text: csv })
  assert.equal(mapping.detected.notes, 'Mentiuni')
  assert.equal(mapping.detected.employerRequirements, 'Mentiuni aviz')
  assert.equal(rows[0].notes, 'observatie interna')
  assert.equal(rows[0].employerRequirements, 'CU ATRIBUTII COND. AUTO CAT B')
})
