import { describe, expect, test } from 'vitest'
import type { RetainingWall } from '../site/earthworks'
import { reedGeometry, waterGeometry } from './PondMesh'
import { retainingWallGeometry } from './RetainingWalls'

const octagon = Array.from({ length: 8 }, (_, i): readonly [number, number] => [3 * Math.cos((i * Math.PI) / 4), 2 * Math.sin((i * Math.PI) / 4)])

describe('pond water and reeds', () => {
  test('the water is the outline triangulated flat at its level', () => {
    const g = waterGeometry(octagon)
    expect(g.getIndex()?.count).toBe((octagon.length - 2) * 3)
    const p = g.getAttribute('position')
    for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBe(0)
  })
  test('reeds are the same for the same seed, on the ground or the water', () => {
    const a = reedGeometry(octagon, 7, 2.2, () => 0)
    const b = reedGeometry(octagon, 7, 2.2, () => 0)
    expect(a?.getAttribute('position').array).toEqual(b?.getAttribute('position').array)
    const raised = reedGeometry(octagon, 7, 2.2, () => 1)
    const minY = (g: typeof a) => Math.min(...Array.from(g?.getAttribute('position').array ?? []).filter((_, i) => i % 3 === 1))
    expect(minY(raised) - minY(a)).toBeCloseTo(1, 6)
    expect(reedGeometry(octagon, 7, 0, () => 0)).toBeNull()
  })
})

describe('retaining walls', () => {
  // a straight wall along x, the cut to the south (−n), the bank to the north
  const wall: RetainingWall = { id: 'H', material: 'stone', pts: [[0, 0], [4, 0]], outer: [[0, 0.5], [4, 0.5]], tops: [11, 11.2], foot: 8.85, floor: 9 }
  const g = retainingWallGeometry([wall])
  const pos = g.getAttribute('position')
  const nrm = g.getAttribute('normal')

  test('a run is a closed slab: two faces, a cap and two ends', () => {
    expect(pos.count).toBe(5 * 6)
  })
  test('the face toward the cut looks into it, the cap looks up', () => {
    // scene z is −north, so the cut (south) is +z
    expect(nrm.getZ(0)).toBeCloseTo(1)
    expect(nrm.getY(6)).toBeCloseTo(1)
    expect(nrm.getZ(12)).toBeCloseTo(-1)
  })
  test('it stands from under the cut floor to the cap', () => {
    const ys = Array.from({ length: pos.count }, (_, i) => pos.getY(i))
    expect(Math.min(...ys)).toBeCloseTo(8.85)
    expect(Math.max(...ys)).toBeCloseTo(11.2)
  })
})
