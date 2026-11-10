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
  stairTooHighText,
  surfaceAt,
  type AttachSite,
} from './attach'
import { buildingMasses } from '../masses'
import { SLAB_M } from '../rails/rails'
import { stairGeomMath } from '../stairs/stairs'
import { stairInfo } from '../stairs/stairSite'
import { planRailWorld } from '../rails/railSite'
import { partFrame } from './partFrame'
import { loadIslandaleTerrain } from '../../site/islandale'
import type { PlanObject } from '../../store/types'

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

  test('a stair takes 11 in of run per 7 in riser of its drop (no slab, at least 0.3 m), at least 6 ft', () => {
    // 2 m: 12 risers, 132 in of run
    expect(attachSpec(buildingMasses(box()), 0, 2, 'stair', flat(2), 9)).toMatchObject({ wing: { kind: 'stair', w: 5, d: 11, h: 0, roof: 'none' } })
    expect(attachSpec(buildingMasses(box()), 0, 2, 'stair', flat(0.2), 9)).toMatchObject({ wing: { d: 6 } })
    expect(attachSpec(buildingMasses(box()), 0, 2, 'stair', flat(5), 9)).toEqual({ reason: stairTooHighText(5 / FT) })
  })

  test('a ramp runs 1:12 from a drop of at least 0.3 m, and is refused past a 30 in rise', () => {
    expect(attachSpec(buildingMasses(box()), 0, 2, 'ramp', flat(0.5), 9)).toMatchObject({ wing: { kind: 'ramp', w: 4, d: Math.ceil((0.5 / FT) * 12) } })
    expect(attachSpec(buildingMasses(box()), 0, 2, 'ramp', flat(0), 9)).toMatchObject({ wing: { d: Math.ceil((0.3 / FT) * 12) } })
    expect(attachSpec(buildingMasses(box()), 0, 2, 'ramp', flat(2), 9)).toEqual({ reason: rampTooLongText(Math.ceil((2 / FT) * 12)) })
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

describe('stairs and ramps from the + chip meet the planner rule (R3.3)', () => {
  const IN = 0.0254
  const stairOf = (below: number) => {
    const r = attachSpec(buildingMasses(box()), 0, 2, 'stair', flat(below), 9)
    if (!('wing' in r)) throw new Error(r.reason)
    const run = Number(r.wing.d) * FT
    return stairGeomMath(Math.max(0.3, below), run)
  }
  for (const ft of [1, 4, 5, 6, 10, 12]) {
    test(`a stair down a ${ft} ft drop has treads of 11 in or more`, () => {
      const m = stairOf(ft * FT)
      expect(m.tread / IN).toBeGreaterThanOrEqual(11 - 1e-6)
      expect(m.ok).toBe(true)
    })
  }
  test('a stair over 12 ft high is refused: it needs landings', () => {
    expect(attachSpec(buildingMasses(box()), 0, 2, 'stair', flat(13 * FT), 9)).toEqual({ reason: stairTooHighText(13) })
  })
  test('a ramp with a 38 in rise is refused rather than added as one 39 ft run', () => {
    const r = attachSpec(buildingMasses(box()), 0, 2, 'ramp', flat(38 * IN), 9)
    expect(r).toHaveProperty('reason')
  })
  test('a ramp with a 24 in rise runs 24 ft, 1:12', () => {
    expect(attachSpec(buildingMasses(box()), 0, 2, 'ramp', flat(24 * IN), 9)).toMatchObject({ wing: { kind: 'ramp', d: 24 } })
  })

  test('in every scheme, no stair or ramp the + chip adds to a cabin is born failing', () => {
    const terrain = loadIslandaleTerrain()
    const born: string[] = []
    let added = 0
    for (const s of loadSchemes()) {
      const plan = planFromScheme(s)
      const objects = plan.order.map((k) => plan.objects[k]).filter((o): o is PlanObject => !!o)
      const world = planRailWorld(objects, terrain)
      for (const o of objects.filter((x) => x.type === 'house')) {
        const frame = partFrame(o, terrain, world.ground)!
        frame.masses.forEach((_, mi) => {
          for (const i of chipEdges(frame.masses, mi)) {
            for (const kind of ['stair', 'ramp'] as const) {
              const r = attachSpec(frame.masses, mi, i, kind, frame.site, 9)
              if (!('wing' in r)) continue
              const params = { ...o.params, wings: [...((o.params.wings as unknown[]) ?? []), r.wing] }
              const at = buildingMasses(params).length - 1
              const info = stairInfo(world, { ...o, params }, at)!
              added++
              const ok = (info.kind === 'stair' ? info.ok : !info.steep) && !info.flightOver
              if (!ok) born.push(`${o.id} mass ${mi} edge ${i} ${kind}: d ${r.wing.d}, drop ${(info.drop / IN).toFixed(1)} in, tread ${(info.tread / IN).toFixed(2)} in, slope ${info.slope.toFixed(3)}`)
            }
          }
        })
      }
    }
    expect(added).toBeGreaterThan(100)
    expect(born).toEqual([])
  }, 60000)
})
