import { describe, expect, test } from 'vitest'
import { loadIslandaleTerrain } from '../../site/islandale'
import { loadSchemes, schemeById } from '../../site/schemes'
import { elevationAt } from '../../site/terrain'
import { planFromScheme } from '../../store/fromLegacy'
import { buildingMasses } from '../../buildings/masses'
import { deckEdgeSegments, edgeTarget, nearestOnSegment, nearestTarget, wingTopTargets, type ConnectTarget, type EdgeSegment } from './connectTargets'
import { M_PER_FT as FT } from '../../site/units'

const terrain = loadIslandaleTerrain()
const ground = (x: number, n: number) => elevationAt(terrain, x, n)
const plan = planFromScheme(schemeById(loadSchemes(), 'C'))
const objects = plan.order.map((id) => plan.objects[id])

const edge: EdgeSegment = { a: [0, 0], b: [10, 0], nrm: [0, -1], z: 3, label: 'Deck · edge', owner: 'd', mi: 0, edge: 2 }
const point: ConnectTarget = { x: 5, n: -1, z: 2, kind: 'door', label: 'Door' }

describe('edge and point picking', () => {
  test('nearestOnSegment clamps to the ends', () => {
    expect(nearestOnSegment([0, 0], [10, 0], [-3, 4])).toEqual({ t: 0, x: 0, n: 0, d: 5 })
  })

  test('an edge target stays 2 ft off the corners and carries its segment and outward direction', () => {
    const t = edgeTarget(edge, [0.1, 1])
    expect(t.x).toBeCloseTo(2 * FT, 9)
    expect(t).toMatchObject({ n: 0, z: 3, dir: [0, -1], kind: 'deck-edge', segment: { a: [0, 0], b: [10, 0] } })
    expect(edgeTarget(edge, null).x).toBe(5)
  })

  test('nearestTarget prefers a point over an edge at nearly the same distance, and finds nothing out of reach', () => {
    expect(nearestTarget([point], [edge], [5, -0.5], 1)).toBe(point)
    expect(nearestTarget([point], [edge], [8, -0.1], 1)!.kind).toBe('deck-edge')
    expect(nearestTarget([point], [edge], [30, 30], 1)).toBeNull()
  })
})

describe('Scheme C targets', () => {
  test('every stair and ramp wing has a top target with a level, pointing from the wing to its top', () => {
    const wings = objects.filter((o) => o.type === 'house' && !o.hidden).flatMap((o) => buildingMasses(o.params).filter((m) => m.kind === 'stair' || m.kind === 'ramp'))
    const tops = wingTopTargets(objects, terrain, ground)
    expect(tops).toHaveLength(wings.length)
    for (const t of tops) {
      expect(t.kind).toBe('wingtop')
      expect(t.label).toMatch(/(stairs|ramp) top$/)
      expect(Math.hypot(t.dir![0], t.dir![1])).toBeCloseTo(1, 9)
      expect(Number.isFinite(t.z)).toBe(true)
    }
  })

  test('free deck and porch edges come back as site segments with unit outward normals', () => {
    const segs = deckEdgeSegments(objects, terrain, ground)
    expect(segs.length).toBeGreaterThan(0)
    for (const s of segs) {
      expect(Math.hypot(s.nrm[0], s.nrm[1])).toBeCloseTo(1, 9)
      expect(Number.isFinite(s.z)).toBe(true)
      expect(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])).toBeGreaterThan(0)
    }
  })
})
