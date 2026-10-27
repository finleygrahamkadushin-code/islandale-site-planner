import { describe, expect, test } from 'vitest'
import schemes from '../../data/islandale/schemes.json'
import { buildingBounds, buildingMasses, buildingToMass, massToBuilding, massBuildingPoly } from './masses'

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
