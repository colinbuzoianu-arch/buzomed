import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composeFisaRecommendations } from './compose-fisa-recommendations'

const REQ = 'MUNCA IN TURE DE NOAPTE'
const EX = 'Apt cu ochelari de protecție'

test('both present → "REQUIREMENTS. EXISTING TEXT"', () => {
  assert.equal(composeFisaRecommendations(REQ, EX), `${REQ}. ${EX}`)
})

test('only requirements → requirements with no trailing dot', () => {
  assert.equal(composeFisaRecommendations(REQ, ''), REQ)
  assert.equal(composeFisaRecommendations(REQ, null), REQ)
})

test('only existing text → existing with no leading dot', () => {
  assert.equal(composeFisaRecommendations('', EX), EX)
  assert.equal(composeFisaRecommendations(null, EX), EX)
})

test('neither → empty string', () => {
  assert.equal(composeFisaRecommendations('', ''), '')
  assert.equal(composeFisaRecommendations(null, undefined), '')
})

test('requirements already ending with "." is not double-dotted', () => {
  assert.equal(composeFisaRecommendations('Conduce auto cat. B.', EX), `Conduce auto cat. B. ${EX}`)
})

test('both parts are trimmed and no ". " ends or starts the result', () => {
  assert.equal(composeFisaRecommendations('  REQ  ', '  EX  '), 'REQ. EX')
  const onlyReq = composeFisaRecommendations('  REQ  ', '   ')
  assert.equal(onlyReq, 'REQ')
  assert.ok(!onlyReq.endsWith('. '))
})
