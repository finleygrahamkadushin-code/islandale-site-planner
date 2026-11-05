import { describe, expect, test } from 'vitest'
import { carsPatch, changes, extraField, extraPatch, roofPatch, shapePatch } from './shapeEdits'
import { withSize } from './wingEdits'

describe('shape editor fields (legacy sh-shape / sh-taper / pd-shape)', () => {
  test('each shape shows the one extra field the old planner shows', () => {
    expect(extraField('trap')?.key).toBe('taper')
    expect(extraField('para')?.key).toBe('skew')
    expect(extraField('kidney')?.key).toBe('bend')
    expect(extraField('teardrop')?.key).toBe('point')
    expect(extraField('ellipse')).toBeNull()
    expect(extraField('rect')).toBeNull()
  })

  test('the extra value is kept to a fraction for bend, point and taper, any number for skew', () => {
    expect(extraPatch('kidney', 0.6)).toEqual({ bend: 0.6 })
    expect(extraPatch('kidney', 3)).toEqual({ bend: 1 })
    expect(extraPatch('teardrop', 0)).toEqual({ point: undefined })
    expect(extraPatch('para', -4)).toEqual({ skew: -4 })
  })

  test('shapes are kept to their list; ribbon is a pad shape only', () => {
    expect(shapePatch('kidney', false)).toEqual({ shape: 'kidney' })
    expect(shapePatch('ribbon', false)).toEqual({ shape: 'rect' })
    expect(shapePatch('ribbon', true)).toEqual({ shape: 'ribbon' })
    expect(shapePatch('poly', true)).toEqual({ shape: 'rect' })
  })

  test('roof fields clamp as the old planner does', () => {
    expect(roofPatch('roof', 'saddle')).toEqual({ roof: 'saddle' })
    expect(roofPatch('roof', 'tent')).toEqual({ roof: 'gable' })
    expect(roofPatch('overhang', '9')).toEqual({ overhang: 6 })
    expect(roofPatch('pitch', '0.2')).toEqual({ pitch: 1 })
    expect(roofPatch('roofMat', '')).toEqual({ roofMat: undefined })
    expect(roofPatch('roofMat', 'copper')).toEqual({ roofMat: 'copper' })
    expect(roofPatch('curl', '1.4')).toEqual({ curl: 1 })
    expect(carsPatch(12)).toEqual({ cars: 8 })
  })

  test('an unchanged patch is no change', () => {
    expect(changes({ shape: 'kidney', bend: 0.4 }, { bend: 0.4 })).toBe(false)
    expect(changes({ shape: 'kidney' }, { bend: 0.4 })).toBe(true)
  })

  test("a ribbon's new width scales its centreline, its path width stays", () => {
    const p = { shape: 'ribbon', w: 20, d: 5, pts: [[0, 0], [10, 0], [10, 10]] }
    expect(withSize(p, 40, 5)).toEqual({ shape: 'ribbon', w: 40, d: 5, pts: [[0, 0], [20, 0], [20, 20]] })
    expect(withSize(p, 20, 8)).toEqual({ ...p, d: 8 })
  })
})
