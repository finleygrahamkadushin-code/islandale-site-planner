import { describe, expect, test } from 'vitest'
import schemes from '../../data/islandale/schemes.json'
import { buildingBounds, buildingMasses, buildingToMass, edgeName, MAX_WINGS, massToBuilding, massBuildingPoly, partName, wingSlots } from './masses'

type Obj = { name: string; t: string } & Record<string, unknown>
const all = (schemes as unknown as { schemes?: { id: string; objects: Obj[] }[] }).schemes ?? (schemes as unknown as { id: string; objects: Obj[] }[])
const schemeC = all.find((s) => s.id === 'C')!
const prow = schemeC.objects.find((o) => o.name === 'Gathering prow')!

describe('buildingMasses', () => {
  test('the gathering prow is its main mass plus four wings, in order', () => {
    const masses = buildingMasses(prow)
    expect(masses.map((m) => m.kind)).toEqual(['wall', 'porch', 'stair', 'deck', 'porch'])
    expect(masses[0]).toMatchObject({ dx: 0, dz: 0, rot: 0, w: 28, d: 26, h: 11, roof: 'prow', main: true })
    expect(masses[1]).toMatchObject({ dx: 0, dz: -16.5, shape: 'oct', roof: 'pyramid', open: true, lvl: 0 })
    expect(masses[2]).toMatchObject({ dz: -22.5, rot: 180, roof: 'none', open: true })
    expect(masses[3].steps).toEqual({ e0: 3, e1: 14, tread: 1.75 })
  })

  test('open wings follow the legacy rule: porch, deck, stair and ramp are open', () => {
    const m = buildingMasses({ w: 10, d: 10, h: 9, wings: [{ w: 4, d: 4, h: 8 }, { kind: 'deck', w: 6, d: 6 }, { w: 4, d: 4, open: true }] })
    expect(m.slice(1).map((x) => [x.kind, x.open])).toEqual([['wall', false], ['deck', true], ['porch', true]])
  })

  test('bad wing entries are skipped and numbers are clamped', () => {
    const m = buildingMasses({ w: 10, d: 10, h: 9, wings: [null, 'x', { w: 4, d: 4, lvl: 99 }] })
    expect(m).toHaveLength(2)
    expect(m[1].lvl).toBe(30)
  })
})

describe('mass frames', () => {
  test('a wing point moves by its offset and turns by its rotation (legacy massPolyLocal)', () => {
    const wing = buildingMasses({ w: 10, d: 10, h: 9, wings: [{ dx: 5, dz: -10, rot: 90, w: 4, d: 2 }] })[1]
    // three.js rotateY(90°): x' = z, z' = -x
    const [x, z] = massToBuilding(wing, [1, 0])
    expect(x).toBeCloseTo(5)
    expect(z).toBeCloseTo(-11)
  })

  test('buildingToMass undoes massToBuilding', () => {
    const wing = buildingMasses({ w: 10, d: 10, h: 9, wings: [{ dx: 3, dz: -7, rot: 35, w: 4, d: 2 }] })[1]
    const [x, z] = buildingToMass(wing, massToBuilding(wing, [1.5, -2]))
    expect(x).toBeCloseTo(1.5)
    expect(z).toBeCloseTo(-2)
  })

  test('building bounds take in every wing, as the legacy bbox() did', () => {
    const b = buildingBounds(buildingMasses(prow))
    const main = massBuildingPoly(buildingMasses(prow)[0])
    expect(b.minz).toBeLessThan(Math.min(...main.map((p) => p[1])) - 5)
    expect(b.maxx - b.minx).toBeGreaterThan(28)
  })
})

describe('wing slots, names and new fields', () => {
  test('mass n is the n-th well-formed wing, and both helpers stop at MAX_WINGS', () => {
    const wings = [null, { w: 4, d: 4 }, 'x', ...Array.from({ length: 14 }, (_, i) => ({ w: 4, d: 4, dx: i }))]
    const p = { w: 10, d: 10, h: 9, wings }
    expect(wingSlots(p)).toHaveLength(MAX_WINGS)
    expect(wingSlots(p).slice(0, 2)).toEqual([1, 3])
    expect(buildingMasses(p)).toHaveLength(MAX_WINGS + 1)
    expect(wingSlots({ w: 10 })).toEqual([])
  })

  test('the gathering prow names its parts as the old planner does', () => {
    const masses = buildingMasses(prow)
    expect(masses.map((m, i) => partName(m, i))).toEqual(['Main', 'Porch 1', 'Stair 2', 'Deck 3', 'Porch 4'])
    expect(partName({ kind: 'porch', name: 'Cave hearth' }, 2)).toBe('Cave hearth')
    expect(partName({ kind: 'wall', name: 'ignored on the main walls' }, 0)).toBe('Main')
  })

  test('rect edges are back, right, front, left; any other outline counts edges from 1', () => {
    const rect = { shape: 'rect' }
    expect([0, 1, 2, 3].map((i) => edgeName(rect, i))).toEqual(['back', 'right', 'front', 'left'])
    expect(edgeName({ shape: 'oct' }, 0)).toBe('edge 1')
    expect(edgeName({ shape: 'hex' }, 5)).toBe('edge 6')
  })

  test('per-edge rails are read from saved string keys and keys past the last edge are dropped', () => {
    const [, wing] = buildingMasses({ w: 10, d: 10, wings: [{ kind: 'deck', w: 6, d: 6, rails: { '0': true, 2: false, '7': true, x: true, '1': 'yes' } }] })
    expect(wing.rails).toEqual({ 0: true, 2: false })
    const [, plain] = buildingMasses({ w: 10, d: 10, wings: [{ kind: 'deck', w: 6, d: 6, rail: 'sides' }] })
    expect(plain.rails).toBeUndefined()
    expect(plain.rail).toBe('sides')
  })

  test('name, footZ and clearTop pass through from the wing', () => {
    const [main, wing] = buildingMasses({ w: 10, d: 10, name: 'Hall', wings: [{ kind: 'stair', w: 4, d: 6, name: 'Back steps', footZ: 3.2, clearTop: true }] })
    expect(main.name).toBeUndefined()
    expect(wing).toMatchObject({ name: 'Back steps', footZ: 3.2, clearTop: true })
    expect(buildingMasses({ w: 10, d: 10, wings: [{ w: 4, d: 4, footZ: 'x', clearTop: 1 }] })[1]).toMatchObject({ footZ: undefined, clearTop: undefined })
  })
})
