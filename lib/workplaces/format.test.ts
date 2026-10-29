import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatWorkplaceLabel } from './format'

test('workplace with a site prints "{workplace} / {site}"', () => {
  assert.equal(
    formatWorkplaceLabel({ name: 'COMERCIAL', workSite: { name: 'GEOAGIU' } }),
    'COMERCIAL / GEOAGIU'
  )
})

test('workplace without a site prints just its name (unchanged pre-feature behaviour)', () => {
  assert.equal(formatWorkplaceLabel({ name: 'Comercial' }), 'Comercial')
  assert.equal(formatWorkplaceLabel({ name: 'Comercial', workSite: null }), 'Comercial')
  assert.equal(
    formatWorkplaceLabel({ name: 'Comercial', workSite: { name: null } }),
    'Comercial'
  )
})

test('a blank/whitespace site name never renders a dangling separator', () => {
  assert.equal(formatWorkplaceLabel({ name: 'Comercial', workSite: { name: '   ' } }), 'Comercial')
})

test('both parts are trimmed', () => {
  assert.equal(
    formatWorkplaceLabel({ name: '  Comercial  ', workSite: { name: '  Geoagiu  ' } }),
    'Comercial / Geoagiu'
  )
})
