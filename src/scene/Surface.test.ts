import { describe, expect, test } from 'vitest'
import { realisticColour } from './Surface'

describe('realisticColour', () => {
  test('wood is the shared post colour unless given one: wood deck rails are the legacy #6e5a44', () => {
    expect(realisticColour('wood')).toBe('#6e5236')
    expect(realisticColour('wood', '#6e5a44')).toBe('#6e5a44')
  })

  test('kinds with a fixed colour keep it whatever they are given', () => {
    expect(realisticColour('concrete', '#ff0000')).toBe('#9d9a93')
    expect(realisticColour('deck')).toBe('#c9ad84')
  })
})
