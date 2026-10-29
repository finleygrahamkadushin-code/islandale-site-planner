import { describe, expect, test } from 'vitest'
import { buildingMasses, deckObjectMass, massPoly, type Mass } from './masses'
import { materialise } from './railEdits'
import { edgeDropM, edgeFree, outwardNormal, resolveEdges, type RailMassSite } from './railRules'

const FT = 0.3048
const flat = (z: number) => () => z
/** A 20 × 20 ft main mass with one wing hung off its front (+z) wall. */
const house = (wing: Record<string, unknown>, more: Record<string, unknown>[] = []): Mass[] =>
  buildingMasses({ w: 20, d: 20, wings: [{ w: 12, d: 8, dz: 14, open: true, ...wing }, ...more] })
const site = (floor: number, groundAt: RailMassSite['groundAt'] = flat(0), extra: Partial<RailMassSite> = {}): RailMassSite => ({ floor, groundAt, ...extra })

describe('outwardNormal', () => {
  test('a rect edge 0 (back) faces -z, edge 1 (right) +x', () => {
    const poly = massPoly(house({ kind: 'deck' })[1])
    expect(outwardNormal(poly, 0)).toEqual([0, -1])
    expect(outwardNormal(poly, 1)).toEqual([1, -0])
  })
})

describe('edgeDropM (legacy edgeDropFt)', () => {
  const poly = massPoly(house({ kind: 'deck' })[1])
  test('flat ground: floor height plus the slab on every edge', () => {
    expect(edgeDropM(poly, 0, 1, flat(0))).toBeCloseTo(1.15)
  })
  test('each edge reads the ground 0.9 m outside it, so a slope gives each edge its own drop', () => {
    // ground falls 0.1 m per foot toward +x
    const ground = (x: number) => -0.1 * x
    const right = edgeDropM(poly, 1, 0, ground)
    const left = edgeDropM(poly, 3, 0, ground)
    expect(right).toBeCloseTo(0.1 * (6 + 0.9 / FT) + 0.15)
    // the ground on the left is higher than the floor
    expect(left).toBe(0)
    // the back edge takes its lower end, probed straight out behind it
    expect(edgeDropM(poly, 0, 0, ground)).toBeCloseTo(0.1 * 6 + 0.15)
  })
  test('never below zero, and no slab for a standalone deck', () => {
    expect(edgeDropM(poly, 0, -5, flat(0))).toBe(0)
    expect(edgeDropM(poly, 0, 1, flat(0), 0)).toBeCloseTo(1)
  })
})

describe('edgeFree (legacy attach-core)', () => {
  test('a deck edge against the main walls is covered; its other edges are free', () => {
    // the wing's back edge (0) lies on the main mass's front wall at z = 10
    const ms = house({ kind: 'deck' })
    expect(edgeFree(ms, 1, 0)).toBe(false)
    expect([1, 2, 3].map((i) => edgeFree(ms, 1, i))).toEqual([true, true, true])
  })
  test('a stair hung off an edge does not cover it, but the stair is covered by what it touches', () => {
    // a stair in front of the deck's front edge (z = 18)
    const ms = house({ kind: 'deck' }, [{ kind: 'stair', open: true, w: 4, d: 6, dz: 21 }])
    expect(edgeFree(ms, 1, 2)).toBe(true)
    expect(edgeFree(ms, 2, 0)).toBe(false)
  })
  test('a roof-only porch (slab false) covers nothing', () => {
    const ms = house({ kind: 'deck' }, [{ kind: 'porch', open: true, slab: false, w: 12, d: 8, dz: 22 }])
    expect(edgeFree(ms, 1, 2)).toBe(true)
  })
})

describe('resolveEdges', () => {
  test('masses that never carry a guard get null', () => {
    const ms = house({ kind: 'stair', w: 4, d: 6 })
    expect(resolveEdges(ms, 0, site(1))).toBeNull()
    expect(resolveEdges(ms, 1, site(1))).toBeNull()
  })

  describe('no rails map: the whole-wing rule', () => {
    test('a low deck is railed on every edge whatever its height (legacy deck branch)', () => {
      const e = resolveEdges(house({ kind: 'deck' }), 1, site(0.2))!
      expect(e.map((x) => x.drawn)).toEqual([true, true, true, true])
      expect(e.map((x) => x.required)).toEqual([false, false, false, false])
      expect(e.every((x) => x.state === 'auto')).toBe(true)
      // what auto would draw: nothing; materialise keeps the drawn rails on
      expect(e.map((x) => x.auto)).toEqual([false, false, false, false])
    })
    test('a low porch has no guard; a raised one is railed all round', () => {
      expect(resolveEdges(house({ kind: 'porch' }), 1, site(0.2))!.some((x) => x.drawn)).toBe(false)
      expect(resolveEdges(house({ kind: 'porch', lvl: 2 }), 1, site(0.2))!.every((x) => x.drawn)).toBe(true)
    })
    test('rail "sides" leaves a deck’s ends open; sitting steps leave their edges open', () => {
      expect(resolveEdges(house({ kind: 'deck', rail: 'sides' }), 1, site(2))!.map((x) => x.drawn)).toEqual([true, false, true, false])
      expect(resolveEdges(house({ kind: 'deck', steps: { e0: 2, e1: 2 } }), 1, site(2))!.map((x) => x.drawn)).toEqual([true, true, false, true])
    })
  })

  describe('with a rails map: the per-edge rule', () => {
    test('auto edges are drawn only past 30 in, and only when free', () => {
      const e = resolveEdges(house({ kind: 'deck', rails: {} }), 1, site(1))!
      // edge 0 is against the house
      expect(e.map((x) => [x.free, x.required, x.drawn])).toEqual([
        [false, false, false],
        [true, true, true],
        [true, true, true],
        [true, true, true],
      ])
      expect(resolveEdges(house({ kind: 'deck', rails: {} }), 1, site(0.3))!.some((x) => x.drawn)).toBe(false)
    })
    test('on and off override auto; a covered edge stays bare even when on', () => {
      const e = resolveEdges(house({ kind: 'deck', rails: { 0: true, 1: false, 2: true } }), 1, site(0.3))!
      expect(e.map((x) => x.state)).toEqual(['on', 'off', 'on', 'auto'])
      expect(e.map((x) => x.drawn)).toEqual([false, false, true, false])
      expect(e[1].required).toBe(false)
    })
    test('an off edge past 30 in is required but not drawn (the panel warns)', () => {
      const e = resolveEdges(house({ kind: 'deck', rails: { 2: false } }), 1, site(1))!
      expect(e[2]).toMatchObject({ state: 'off', required: true, drawn: false })
    })
    test('materialising the whole-wing rule then reading it per edge draws the same edges', () => {
      const raw = { w: 12, d: 8, dz: 14, open: true, kind: 'deck', rail: 'sides' }
      const before = resolveEdges(buildingMasses({ w: 20, d: 20, wings: [raw] }), 1, site(0.2))!
      const mapped = materialise(raw, 4, before)
      const after = resolveEdges(buildingMasses({ w: 20, d: 20, wings: [mapped] }), 1, site(0.2))!
      // the edge against the house is covered either way; every free edge keeps what it drew
      expect(after.filter((x) => x.free).map((x) => x.drawn)).toEqual(before.filter((x) => x.free).map((x) => x.drawn))
      expect(mapped.rail).toBeUndefined()
    })
  })

  describe('runs', () => {
    test('a deck edge keeps what its openings leave, dropping stubs of 15 cm or less', () => {
      const openings = (i: number) => (i === 2 ? { intervals: [[0, 1], [1.1, 3.6]] as const, names: ['Stair 2'] } : { intervals: [], names: [] })
      const e = resolveEdges(house({ kind: 'deck' }), 1, site(1, flat(0), { openings }))!
      expect(e[2].runs).toEqual([])
      expect(e[2].names).toEqual(['Stair 2'])
      expect(e[1].runs).toEqual([[0, 8 * FT]])
    })
    test('a porch rail stops 0.6 ft short of the main walls (legacy onWall)', () => {
      const e = resolveEdges(house({ kind: 'porch', lvl: 2 }), 1, site(1))!
      // edge 0 lies on the wall: no run; edge 1 runs from the wall out, starting about 0.6 ft off it
      expect(e[0].runs).toEqual([])
      const [u0, u1] = e[1].runs[0]
      expect(u0).toBeGreaterThan(0.6 * FT - 0.1)
      expect(u0).toBeLessThan(0.6 * FT + 0.1)
      expect(u1).toBeCloseTo(8 * FT)
    })
  })

  describe('standalone decks', () => {
    const deck = (p: Record<string, unknown>) => [deckObjectMass({ w: 12, d: 6, h: 1.5, ...p })]
    test('every edge is free; railed all round past 30 in, or never by the legacy rule', () => {
      expect(resolveEdges(deck({}), 0, site(2, flat(0), { standalone: { dropM: 2 } }))!.every((x) => x.drawn && x.free)).toBe(true)
      expect(resolveEdges(deck({}), 0, site(0.4, flat(0), { standalone: { dropM: 0.4 } }))!.some((x) => x.drawn)).toBe(false)
      expect(resolveEdges(deck({ rail: true }), 0, site(0.4, flat(0), { standalone: { dropM: 0.4 } }))!.every((x) => x.drawn)).toBe(true)
    })
    test('with a map, per edge, and the drop has no slab', () => {
      const e = resolveEdges(deck({ rails: { 1: false } }), 0, site(1, flat(0), { standalone: { dropM: 1 } }))!
      expect(e.map((x) => x.drawn)).toEqual([true, false, true, true])
      expect(e[0].dropFt).toBeCloseTo(1 / FT)
    })
  })
})
