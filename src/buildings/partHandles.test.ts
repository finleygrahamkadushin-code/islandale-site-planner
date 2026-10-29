import { describe, expect, test } from 'vitest'
import { buildingMasses, wingMass } from './masses'
import {
  cursorFor,
  edgeDeltaFt,
  edgeMid,
  edgeNormal,
  gripCentre,
  hostDirection,
  isRectPart,
  knobAngle,
  knobPoint,
  nudgeLocal,
  resizedWing,
  snapFt,
} from './partHandles'

const FT = 0.3048
/** A 12 × 10 deck hung off the right edge of a 20 ft square cabin, turned to face east. */
const deck = () => wingMass({ kind: 'deck', w: 12, d: 10, dx: 15, dz: 0, rot: 90 })
const round = (p: readonly number[]) => p.map((v) => Math.round(v * 1e6) / 1e6 + 0)

describe('snapFt', () => {
  test('snaps to the inch, or keeps a thousandth with snapping off', () => {
    expect(snapFt(2.05, true)).toBeCloseTo(25 / 12, 9)
    expect(snapFt(2.0504, false)).toBe(2.05)
    expect(snapFt(48, true, 5)).toBe(50)
  })
})

describe('edge handles', () => {
  test('only rect parts with four corners have them', () => {
    expect(isRectPart(deck())).toBe(true)
    expect(isRectPart(wingMass({ shape: 'hex', w: 10, d: 10 }))).toBe(false)
  })

  test("an edge's midpoint and outward direction follow the wing's turn", () => {
    expect(round(edgeMid(deck(), 2))).toEqual([20, 0])
    expect(round(edgeNormal(deck(), 2))).toEqual([1, 0])
    expect(round(edgeNormal(deck(), 1))).toEqual([0, -1])
  })

  test('pulling the front edge 2 ft out deepens the wing by 2 ft and keeps its back on the house', () => {
    const m = deck()
    const delta = edgeDeltaFt(m, 2, [22, 0.7], true)
    expect(delta).toBe(2)
    expect(resizedWing(m, 2, delta)).toEqual({ d: 12, dx: 16, dz: 0 })
  })

  test('drags snap to the inch, or not with Shift', () => {
    const m = deck()
    expect(edgeDeltaFt(m, 2, [22.05, 0], true)).toBeCloseTo(25 / 12, 9)
    expect(edgeDeltaFt(m, 2, [22.0504, 0], false)).toBe(2.05)
  })

  test('a side edge changes the width and moves the centre half as far', () => {
    // the wing's right (+x) edge faces the cabin's -z (back) once the wing is turned 90°
    expect(resizedWing(deck(), 1, 3)).toEqual({ w: 15, dx: 15, dz: -1.5 })
  })

  test('a part is never dragged below 3 ft, and a drag that changes nothing is null', () => {
    expect(resizedWing(deck(), 2, -20)).toEqual({ d: 3, dx: 11.5, dz: 0 })
    expect(resizedWing(deck(), 2, 0)).toBeNull()
  })
})

describe('grip', () => {
  test('a wing slides along the host edge it hangs off', () => {
    const masses = buildingMasses({ w: 20, d: 20, wings: [{ kind: 'deck', w: 12, d: 10, dx: 15, rot: 90 }] })
    const host = hostDirection(masses, 1)
    expect(host && round(host).map(Math.abs)).toEqual([0, 1])
    expect(gripCentre([15, 0], [17, 3.3], host, true)).toEqual([15, 3.3333])
  })

  test('a wing touching nothing moves freely, each axis snapped', () => {
    const masses = buildingMasses({ w: 20, d: 20, wings: [{ kind: 'deck', w: 12, d: 10, dx: 30, rot: 90 }] })
    expect(hostDirection(masses, 1)).toBeNull()
    expect(gripCentre([30, 0], [31, 3.3], null, true)).toEqual([31, 3.3333])
    expect(gripCentre([30, 0], [31.0004, 3.3], null, false)).toEqual([31, 3.3])
  })

  test('stairs are no host', () => {
    const masses = buildingMasses({ w: 20, d: 20, wings: [{ kind: 'stair', w: 4, d: 4, dz: 12 }, { kind: 'deck', w: 4, d: 4, dx: 0, dz: 16 }] })
    expect(hostDirection(masses, 2)).toBeNull()
  })
})

describe('knob', () => {
  test('sits 4 ft beyond the front edge and turns the front to the pointer in 5° steps', () => {
    expect(round(knobPoint(deck()))).toEqual([24, 0])
    expect(knobAngle(deck(), [16, 1], true)).toBe(45)
    expect(knobAngle({ dx: 0, dz: 0 }, [1, 0.9], true)).toBe(50)
    expect(knobAngle({ dx: 0, dz: 0 }, [1, 0.9], false)).toBe(48.013)
  })
})

describe('nudgeLocal', () => {
  test('east and north steps in the cabin frame (north is -z)', () => {
    expect(nudgeLocal(0, FT, 0)).toEqual([1, 0])
    expect(nudgeLocal(0, 0, FT)).toEqual([0, -1])
    expect(nudgeLocal(90, FT, 0).map((v) => v + 0)).toEqual([0, 1])
  })
})

describe('cursorFor', () => {
  test('folds the edge direction on screen into four resize cursors', () => {
    expect(cursorFor(1, 0)).toBe('ew-resize')
    expect(cursorFor(-1, 0.1)).toBe('ew-resize')
    expect(cursorFor(0, -1)).toBe('ns-resize')
    expect(cursorFor(1, 1)).toBe('nwse-resize')
    expect(cursorFor(-1, 1)).toBe('nesw-resize')
  })
})
