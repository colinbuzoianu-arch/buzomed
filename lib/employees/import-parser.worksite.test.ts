import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseImportFile } from './import-parser'

/**
 * The "punct de lucru" (WorkSite) column must be detected as its OWN column,
 * distinct from "loc de muncă"/LOCATIE (Workplace). This is the parse-layer
 * half of the §Test case: LOCATIE=COMERCIAL + PUNCT DE LUCRU=GEOAGIU must
 * produce two separate values, not collapse into one.
 */

test('LOCATIE maps to workplaceName and PUNCT DE LUCRU maps to workSiteName (distinct)', async () => {
  const csv = ['Nume,Prenume,LOCATIE,PUNCT DE LUCRU', 'Pop,Ion,COMERCIAL,GEOAGIU'].join('\n')
  const { mapping, rows } = await parseImportFile({ text: csv })

  assert.equal(mapping.detected.workplaceName, 'LOCATIE')
  assert.equal(mapping.detected.workSiteName, 'PUNCT DE LUCRU')

  assert.equal(rows.length, 1)
  assert.equal(rows[0].workplaceName, 'COMERCIAL')
  assert.equal(rows[0].workSiteName, 'GEOAGIU')
})

test('a "punct de lucru" header is no longer swallowed by the workplace column', async () => {
  // Only the site column present: it must NOT be read as the loc de muncă.
  const csv = ['Nume,Prenume,Punct de lucru', 'Pop,Ion,BRAD'].join('\n')
  const { mapping, rows } = await parseImportFile({ text: csv })

  assert.equal(mapping.detected.workSiteName, 'Punct de lucru')
  assert.equal(mapping.detected.workplaceName, undefined)
  assert.equal(rows[0].workSiteName, 'BRAD')
  assert.equal(rows[0].workplaceName, null)
})

test('sucursala is recognised as a work site', async () => {
  const csv = ['Nume,Prenume,Sucursala', 'Pop,Ion,Hunedoara'].join('\n')
  const { mapping } = await parseImportFile({ text: csv })
  assert.equal(mapping.detected.workSiteName, 'Sucursala')
})
