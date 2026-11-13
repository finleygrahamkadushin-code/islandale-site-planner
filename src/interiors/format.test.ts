import { describe, expect, test } from 'vitest'
import { fmtLen } from './format'

describe('fmtLen: the interior editor writes lengths as on a drawing, to the inch', () => {
  test.each([
    [12, `12'-0"`],
    [12.5, `12'-6"`],
    [0.75, `0'-9"`],
    [2 + 9.5 / 12, `2'-10"`],
    [11.99 / 12, `1'-0"`],
    [0, `0'-0"`],
  ])('%s ft', (ft, text) => {
    expect(fmtLen(ft)).toBe(text)
  })
  test('no number writes nothing', () => {
    expect(fmtLen(NaN)).toBe('')
  })
})
