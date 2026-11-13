import { describe, expect, test } from 'vitest'
import { ftToM } from '../site/units'
import { positionWords } from './announce'

describe('positionWords', () => {
  test('writes a point as the Placement fields do, to the quarter inch (R11)', () => {
    expect(positionWords({ x: ftToM(10 + 4.25 / 12), n: ftToM(-20) })).toBe(`East 10' 4 1/4", North -20'`)
    expect(positionWords({ x: ftToM(0.5 / 12), n: 0 })).toBe(`East 1/2", North 0"`)
  })
})
