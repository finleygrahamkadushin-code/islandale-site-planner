import { describe, expect, test } from 'vitest'
import { planFromScheme } from '../../store/fromLegacy'
import { loadSchemes, schemeById } from '../../site/schemes'
import {
  ACCESS_HOST_TEXT,
  addedText,
  attachSpec,
  chipEdges,
  DOOR_WALLS_TEXT,
  doorAddedText,
  doorCut,
  NOT_FREE_TEXT,
  overlapsAny,
  partEdges,
  rampTooLongText,
  surfaceAt,
  type AttachSite,
} from './attach'
import { buildingMasses } from '../masses'
import { SLAB_M } from '../rails/rails'

const FT = 0.3048
const FLOOR = 10
/** Level ground `below` metres under the floor. */
const flat = (below: number): AttachSite => ({ floor: FLOOR, groundAt: () => FLOOR - below })
const box = (extra: Record<string, unknown> = {}) => ({ w: 20, d: 20, h: 9, ...extra })
const prowParams = () => planFromScheme(schemeById(loadSchemes(), 'C')).objects['C-0'].params

describe('partEdges', () => {
  test('a rect main mass: back, right, front, left with outward normals and the slab-top surface', () => {
    const E = partEdges(buildingMasses(box()), 0, flat(1))
    expect(E.map((e) => e.n.map((v) => Math.round(v) + 0))).toEqual([[0, -1], [1, 0], [0, 1], [-1, 0]])
    expect(E[1].mid).toEqual([10, 0])
    expect(E[1].lenFt).toBeCloseTo(20, 9)
    expect(E[1].z).toBeCloseTo(FLOOR + SLAB_M, 9)
  })

  test('a stair runs from the floor at its top down to the ground at its foot', () => {
    const masses = buildingMasses(box({ wings: [{ kind: 'stair', w: 4, d: 6, dz: 13 }] }))
    const site = flat(1.2)
    expect(surfaceAt(masses, 1, site, [0, -3])).toBeCloseTo(FLOOR, 9)
    expect(surfaceAt(masses, 1, site, [0, 3])).toBeCloseTo(FLOOR - 1.2, 9)
    expect(surfaceAt(masses, 1, site, [0, 0])).toBeCloseTo(FLOOR - 0.6, 9)
  })
})

describe('chipEdges', () => {
  test('free edges only; none on stairs', () => {
    const masses = buildingMasses(box({ wings: [{ kind: 'porch', w: 8, d: 5, dz: 12.5 }, { kind: 'stair', w: 4, d: 4, dz: 17 }] }))
    expect(chipEdges(masses, 0)).toEqual([0, 1, 3])
    expect(chipEdges(masses, 1)).toEqual([1, 2, 3])
    expect(chipEdges(masses, 2)).toEqual([])
  })

  test("a curved outline is thinned out: the prow's 17-edge main walls get a chip on the free right side only", () => {
    expect(chipEdges(buildingMasses(prowParams()), 0)).toEqual([1])
  })
})

describe('attachSpec', () => {
  test('a deck off the right edge sits with its back on the edge, turned to face out, on the host level', () => {
    const r = attachSpec(buildingMasses(box()), 0, 1, 'deck', flat(1), 9)
    expect(r).toMatchObject({ overlaps: false, wing: { kind: 'deck', open: true, h: 1, roof: 'none', shape: 'rect', w: 12, d: 10, rot: 90, lvl: 0, dx: 15, dz: 0 } })
    expect('wing' in r && 'rail' in r.wing).toBe(false)
  })

  test('a porch is 12 by 8 with a shed roof one foot under the cabin walls; front and left edges face 0 and -90', () => {
    expect(attachSpec(buildingMasses(box()), 0, 2, 'porch', flat(1), 11)).toMatchObject({ wing: { kind: 'porch', w: 12, d: 8, h: 10, roof: 'shed', pitch: 3, rot: 0, dz: 14 } })
    expect(attachSpec(buildingMasses(box()), 0, 3, 'porch', flat(1), 6)).toMatchObject({ wing: { h: 7, rot: -90, dx: -14 } })
  })

  test('a stair takes 1.6 ft of run per foot of drop, 6 to 14 ft', () => {
    const drop = (m: number) => (m + SLAB_M) / FT
    const r = attachSpec(buildingMasses(box()), 0, 2, 'stair', flat(2), 9)
    expect(r).toMatchObject({ wing: { kind: 'stair', w: 5, d: Math.round(drop(2) * 1.6), h: 0, roof: 'none' } })
    expect(attachSpec(buildingMasses(box()), 0, 2, 'stair', flat(0.2), 9)).toMatchObject({ wing: { d: 6 } })
    expect(attachSpec(buildingMasses(box()), 0, 2, 'stair', flat(5), 9)).toMatchObject({ wing: { d: 14 } })
  })

  test('a ramp runs 1:12, at least 8 ft, and is refused past 40 ft', () => {
    const need = Math.ceil(((0.5 + SLAB_M) / FT) * 12)
    expect(attachSpec(buildingMasses(box()), 0, 2, 'ramp', flat(0.5), 9)).toMatchObject({ wing: { kind: 'ramp', w: 4, d: need } })
    expect(attachSpec(buildingMasses(box()), 0, 2, 'ramp', flat(0), 9)).toMatchObject({ wing: { d: 8 } })
    expect(attachSpec(buildingMasses(box()), 0, 2, 'ramp', flat(2), 9)).toEqual({ reason: rampTooLongText(Math.ceil(((2 + SLAB_M) / FT) * 12)) })
  })

  test('slides along the edge a foot at a time to clear another part', () => {
    const masses = buildingMasses(box({ wings: [{ kind: 'wall', w: 10, d: 6, dx: 15, dz: -5 }] }))
    const r = attachSpec(masses, 0, 1, 'deck', flat(1), 9)
    expect(r).toMatchObject({ overlaps: false, wing: { dx: 15, dz: 4 } })
  })

  test('keeps the first spot, flagged, when nothing along the edge is clear', () => {
    const masses = buildingMasses(box({ w: 4, d: 4, wings: [{ kind: 'wall', w: 30, d: 30, dx: 17, dz: 0 }] }))
    // the right edge is covered, so try the front: a 12 ft deck there runs into the big wing whatever the slide
    const r = attachSpec(masses, 0, 2, 'deck', flat(1), 9)
    expect(r).toMatchObject({ overlaps: true, wing: { dx: 0, dz: 7 } })
  })

  test('refuses covered edges and stairs as hosts', () => {
    const masses = buildingMasses(box({ wings: [{ kind: 'porch', w: 8, d: 5, dz: 12.5 }, { kind: 'stair', w: 4, d: 4, dz: 17 }] }))
    expect(attachSpec(masses, 0, 2, 'deck', flat(1), 9)).toEqual({ reason: NOT_FREE_TEXT })
    expect(attachSpec(masses, 2, 2, 'deck', flat(1), 9)).toEqual({ reason: ACCESS_HOST_TEXT })
  })

  test('the toast says what was added off which edge', () => {
    const masses = buildingMasses(box())
    expect(addedText('deck', { w: 12, d: 10 }, false, masses[0], 0, 1)).toBe('Added Deck · 12 × 10 ft off Main right · Undo to remove')
    expect(addedText('stair', { w: 5, d: 7.25 }, true, masses[0], 0, 2)).toBe('Added Stair · 5 × 7.3 ft off Main front — it overlaps another part, drag it clear · Undo to remove')
  })
})

describe('overlapsAny', () => {
  test('a wing touching its host edge does not overlap it; one pushed in does', () => {
    const masses = buildingMasses(box())
    expect(overlapsAny(masses, { w: 12, d: 10, dx: 15, rot: 90 })).toBe(false)
    expect(overlapsAny(masses, { w: 12, d: 10, dx: 14, rot: 90 })).toBe(true)
  })

  test('a small part lying wholly inside the new wing overlaps it (legacy polysOverlap)', () => {
    const masses = buildingMasses(box({ wings: [{ kind: 'deck', w: 2, d: 2, dx: 15, dz: 0, rot: 0 }] }))
    expect(overlapsAny(masses, { w: 12, d: 10, dx: 15, rot: 90 })).toBe(true)
  })
})

describe('doorCut', () => {
  test('centres a 3 ft door on the wall, to the half foot', () => {
    const p = box()
    expect(doorCut(p, buildingMasses(p), 0, 0)).toEqual({ cut: { kind: 'door', edge: 0, x: 8.5, sill: 0, w: 3, h: 7 } })
  })

  test('steps out to the nearest half foot clear of the other openings, the far side first', () => {
    const p = box({ cuts: [{ kind: 'window', edge: 0, x: 8, w: 3, h: 4, sill: 3 }] })
    expect(doorCut(p, buildingMasses(p), 0, 0)).toMatchObject({ cut: { x: 11.5 } })
  })

  test('refuses short walls and open parts, and keeps the door under a low wall', () => {
    const p = box({ w: 3, h: 6, wings: [{ kind: 'porch', w: 8, d: 5, dz: 12.5 }] })
    expect(doorCut(p, buildingMasses(p), 0, 0)).toEqual({ reason: 'Wall is only 3.0 ft long — too short for a 3 ft door' })
    expect(doorCut(p, buildingMasses(p), 1, 2)).toEqual({ reason: DOOR_WALLS_TEXT })
    expect(doorCut(p, buildingMasses(p), 0, 1)).toMatchObject({ cut: { h: 6 } })
    expect(doorAddedText(buildingMasses(p)[0], 0, 1)).toBe('Door added · Main · right — move or resize it in Openings')
  })
})
