import { describe, expect, test } from 'vitest'
import { meshName, nodeName, slugify } from './names'

describe('slugify', () => {
  test("turns a scheme title into the file slug Blender's checker expects", () => {
    expect(slugify('C · Prow & Lantern')).toBe('c-prow-lantern')
  })

  test('keeps letters and digits, drops accents and punctuation', () => {
    expect(slugify('  Café  #2 — North_Wing ')).toBe('cafe-2-north-wing')
  })

  test('falls back to "plan" when nothing is left', () => {
    expect(slugify('· & ·')).toBe('plan')
  })
})

describe('node and mesh names', () => {
  test('an object node is "<name> #<id>"', () => {
    expect(nodeName({ name: 'Gathering Prow', id: 'h1' })).toBe('Gathering Prow #h1')
  })

  test('a mesh name carries part, mass, edge and index, leaving out what is missing', () => {
    expect(meshName('Gathering Prow #h1', { part: 'wall', mi: 0, ei: 3, k: 7 })).toBe('Gathering Prow #h1|wall|m0|e3|7')
    expect(meshName('Gathering Prow #h1', { part: 'roof', mi: 1, k: 2 })).toBe('Gathering Prow #h1|roof|m1|2')
    expect(meshName('Madrone #t4', { part: 'tree', k: 0 })).toBe('Madrone #t4|tree|0')
  })
})
