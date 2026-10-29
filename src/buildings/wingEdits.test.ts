import { describe, expect, test } from 'vitest'
import { buildingMasses } from './masses'
import { localToSite } from './footprint'
import { MIN_PART_FT, tidyWing, wingAt, withAddedWing, withMainEdgeResized, withoutWing, withWing } from './wingEdits'

const cabin = () => ({
  w: 20,
  d: 16,
  h: 9,
  wings: [
    { kind: 'porch', w: 8, d: 5, dz: 10 },
    null,
    { kind: 'stair', w: 4, d: 5, dz: 14, rot: 180 },
    { kind: 'deck', w: 10, d: 6, dx: 14, rails: { 1: true } },
  ],
})

describe('withWing', () => {
  test('changes the raw wing behind a mass index, skipping malformed entries', () => {
    const p = cabin()
    const next = withWing(p, 3, (w) => ({ ...w, w: 12 }))
    expect((next.wings as Record<string, unknown>[])[3]).toMatchObject({ kind: 'deck', w: 12, dx: 14 })
    expect(next.wings).not.toBe(p.wings)
    expect((next.wings as unknown[])[0]).toBe(p.wings[0])
    expect(p.wings[3]).toMatchObject({ w: 10 }) // the input is untouched
    expect(wingAt(next, 2)).toMatchObject({ kind: 'stair' })
  })

  test('refuses the main walls and masses that do not exist', () => {
    expect(() => withWing(cabin(), 0, (w) => w)).toThrow(/main walls/)
    expect(() => withWing(cabin(), 4, (w) => w)).toThrow(/no mass 4/)
  })

  test('a changed rotation is stored in (-180, 180]', () => {
    expect(wingAt(withWing(cabin(), 1, (w) => ({ ...w, rot: 270 })), 1).rot).toBe(-90)
    expect(wingAt(withWing(cabin(), 2, (w) => ({ ...w, rot: -180 })), 2).rot).toBe(180)
  })

  test('per-edge rails go when the outline changes and stay otherwise', () => {
    const moved = wingAt(withWing(cabin(), 3, (w) => ({ ...w, dx: 15, w: 11 })), 3)
    expect(moved.rails).toEqual({ 1: true })
    expect(wingAt(withWing(cabin(), 3, (w) => ({ ...w, shape: 'hex' })), 3).rails).toBeUndefined()
    const poly = { kind: 'deck', shape: 'poly', w: 6, d: 6, pts: [[0, 0], [6, 0], [6, 6]], rails: { 0: false } }
    expect(tidyWing(poly, { ...poly, pts: [[0, 0], [6, 0], [6, 6], [0, 6]] }).rails).toBeUndefined()
    expect(tidyWing(poly, { ...poly, pts: [[0, 0], [6, 0], [6, 6]] }).rails).toEqual({ 0: false })
  })

  test("writing shape 'rect' onto a wing with no shape is no outline change", () => {
    expect(wingAt(withWing(cabin(), 3, (w) => ({ ...w, shape: 'rect' })), 3).rails).toEqual({ 1: true })
  })
})

describe('withAddedWing', () => {
  test('adds a wing at the end, which becomes the last mass', () => {
    const next = withAddedWing(cabin(), { kind: 'ramp', w: 4, d: 12, rot: 270 })
    const masses = buildingMasses(next)
    expect(masses).toHaveLength(5)
    expect(masses[4]).toMatchObject({ kind: 'ramp', rot: -90 })
    expect(withAddedWing({ w: 10, d: 10 }, { kind: 'deck', w: 4, d: 4 }).wings).toHaveLength(1)
  })
})

describe('withoutWing', () => {
  test('removes the wing behind a mass index; later masses move down one', () => {
    const next = withoutWing(cabin(), 2)
    expect(buildingMasses(next).map((m) => m.kind)).toEqual(['wall', 'porch', 'deck'])
    expect(next.wings).toHaveLength(3) // the malformed entry stays where it was
    expect(() => withoutWing(cabin(), 0)).toThrow()
  })

  test('exterior paint keyed by mass index follows its wing', () => {
    const p = {
      ...cabin(),
      ext: {
        parts: { rail: { style: 'steel' } },
        masses: { '0': { wall: 'a' }, '1': { wall: 'b' }, '2': { rail: { style: 'cable' } }, '3': { wall: 'd' } },
        walls: { '0:1': 'x', '2:0': 'y', '3:2': 'z' },
      },
    }
    const next = withoutWing(p, 2)
    expect(next.ext).toEqual({
      parts: { rail: { style: 'steel' } },
      masses: { '0': { wall: 'a' }, '1': { wall: 'b' }, '2': { wall: 'd' } },
      walls: { '0:1': 'x', '2:2': 'z' },
    })
    expect(p.ext.masses['3']).toEqual({ wall: 'd' })
  })
})

describe('withMainEdgeResized (legacy applyMainResize)', () => {
  const placed = () => ({ position: { x: 100, n: 50 }, rotation: 30, params: cabin() })
  const site = (o: ReturnType<typeof placed>, p: readonly [number, number]) => localToSite(o.position, o.rotation, p)
  const near = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6))

  test('the dragged edge moves, the opposite edge and every wing stay put on the ground', () => {
    const o = placed()
    const next = withMainEdgeResized(o, 1, 4) // right edge 4 ft out
    expect(next.params).toMatchObject({ w: 24, d: 16 })
    near(site(next, [-12, 0]), site(o, [-10, 0])) // the left edge
    near(site(next, [12, 0]), site(o, [14, 0])) // the right edge, 4 ft further out
    const wings = (w: unknown) => (w as Record<string, unknown>[]).map((x, i) => [x, i] as const).filter(([x]) => x)
    for (const [w, i] of wings(next.params.wings)) {
      const was = o.params.wings[i]!
      near(site(next, [Number(w.dx ?? 0), Number(w.dz ?? 0)]), site(o, [Number(was.dx ?? 0), Number(was.dz ?? 0)]))
    }
    expect((next.params.wings as unknown[])[1]).toBeNull() // malformed entries stay as they are
    expect(o.params.w).toBe(20) // the input is untouched
  })

  test('the back edge pulled in changes d, down to the minimum', () => {
    const o = placed()
    const next = withMainEdgeResized(o, 0, -4)
    expect(next.params).toMatchObject({ w: 20, d: 12 })
    near(site(next, [0, 6]), site(o, [0, 8])) // the front edge stays
    expect(withMainEdgeResized(o, 2, -40).params.d).toBe(MIN_PART_FT)
  })

  test('no change gives the same object; a non-rect main mass or a bad edge is refused', () => {
    const o = placed()
    expect(withMainEdgeResized(o, 1, 0)).toBe(o)
    const small = { ...o, params: { ...o.params, d: MIN_PART_FT } }
    expect(withMainEdgeResized(small, 0, -2)).toBe(small)
    expect(() => withMainEdgeResized({ ...o, params: { ...o.params, shape: 'hex' } }, 0, 1)).toThrow(/rect/)
    expect(() => withMainEdgeResized(o, 4, 1)).toThrow(/no edge 4/)
  })
})
