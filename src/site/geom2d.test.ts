import { describe, expect, it } from 'vitest'
import { pointInPolygon, pointSegmentDistance, type XY } from './geom2d'
import { pointInPoly } from '../interiors/geom'
import { insidePolygon } from '../export/sheets/svgDims'
import { distToSegment, insidePoly } from '../export/sheets/site/siteGeom'

/*
 * R11.3: the copies of these helpers that were merged into geom2d.ts, run
 * against the shared version on the same cases, boundary and degenerate input
 * included. The private copies are frozen here verbatim from commit 7f48074
 * (foundation.pointInPolygon, routeAuto.inPoly, routeCollect.inPoly,
 * contactShadow.inside, stairWing.segDist, railPick.segDist,
 * routeAuto.pointSegDist, svgDims.toSegment), so the proof that they gave the
 * same answer stays with the merge.
 */

// --- frozen copies (7f48074) ------------------------------------------------

function routeAutoInPoly(P: readonly XY[], x: number, y: number): boolean {
  let c = false
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i]
    const b = P[j]
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}

const routeCollectInPoly = (P: readonly XY[], x: number, n: number): boolean => {
  let c = false
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i]
    const b = P[j]
    if (a[1] > n !== b[1] > n && x < ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}

function contactShadowInside(poly: readonly XY[], x: number, n: number): boolean {
  let on = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, ni] = poly[i]
    const [xj, nj] = poly[j]
    if (ni > n !== nj > n && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) on = !on
  }
  return on
}

function foundationPointInPolygon(poly: readonly XY[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** stairWing.segDist and railPick.segDist were the same text. */
function stairWingSegDist(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const L2 = dx * dx + dz * dz
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t)
}

function routeAutoPointSegDist(p: XY, s: XY, e: XY): number {
  const vx = e[0] - s[0]
  const vy = e[1] - s[1]
  const L2 = vx * vx + vy * vy
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - s[0]) * vx + (p[1] - s[1]) * vy) / L2)) : 0
  return Math.hypot(p[0] - s[0] - t * vx, p[1] - s[1] - t * vy)
}

/** The roofs' and earthworks' form (fittedRoof.segDist, roof.distToEdge, earthworks.segDist): `p - (a + t d)` and `|| 1`. Not merged into geom2d. */
function roofSegDist(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l2 = dx * dx + dz * dz || 1
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))
}

/** svgDims.toSegment, before it used siteGeom.distToSegment. */
function svgDimsToSegment(p: XY, a: XY, b: XY): number {
  const add = (q: XY, v: XY, k = 1): XY => [q[0] + v[0] * k, q[1] + v[1] * k]
  const sub = (q: XY, r: XY): XY => [q[0] - r[0], q[1] - r[1]]
  const len = (v: XY): number => Math.hypot(v[0], v[1])
  const d = sub(b, a)
  const l2 = d[0] * d[0] + d[1] * d[1]
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2)) : 0
  return len(sub(p, add(a, d, t)))
}

// --- shared cases ------------------------------------------------------------

const SQUARE: XY[] = [[0, 0], [4, 0], [4, 4], [0, 4]]
const CONCAVE_U: XY[] = [[0, 0], [6, 0], [6, 5], [4, 5], [4, 2], [2, 2], [2, 5], [0, 5]]
const RINGS: Record<string, XY[]> = {
  square: SQUARE,
  'square, clockwise': [...SQUARE].reverse(),
  triangle: [[0, 0], [5, 0], [1.7, 3.3]],
  'concave U': CONCAVE_U,
  'odd decimals': [[0.1, 0.2], [3.7, -0.4], [4.9, 2.3], [2.2, 4.15], [-0.6, 2.8]],
  'repeated vertex': [[0, 0], [4, 0], [4, 0], [4, 4], [0, 4]],
  'zero area': [[0, 0], [2, 2], [4, 4]],
  'two points': [[0, 0], [3, 1]],
  'one point': [[1, 1]],
  empty: [],
}

/** Every vertex, every edge midpoint, points just off them, and a grid round the ring. */
function probes(ring: readonly XY[]): XY[] {
  const out: XY[] = []
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]
    const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    out.push(a, mid, [a[0] + 1e-9, a[1]], [a[0], a[1] - 1e-9], [mid[0] + 1e-12, mid[1] + 1e-12])
  })
  for (let x = -1.5; x <= 7; x += 0.5) for (let y = -1.5; y <= 6; y += 0.5) out.push([x, y], [x + 0.13, y + 0.37])
  return out
}

describe('pointInPolygon: the merged copies give the same answer', () => {
  for (const [name, ring] of Object.entries(RINGS)) {
    it(`on ${name}, inside, outside, on edges and on vertices`, () => {
      for (const [x, y] of probes(ring)) {
        const want = pointInPolygon(ring, x, y)
        const got = [
          foundationPointInPolygon(ring, x, y),
          routeAutoInPoly(ring, x, y),
          routeCollectInPoly(ring, x, y),
          contactShadowInside(ring, x, y),
          pointInPoly(ring, x, y),
          insidePolygon(ring, [x, y]),
          insidePoly(ring, [x, y]),
        ]
        expect(got, `${name} at ${x}, ${y}`).toEqual(got.map(() => want))
      }
    })
  }

  it('keeps the even-odd rule on the boundary: bottom and left edges count, top and right do not', () => {
    expect([pointInPolygon(SQUARE, 2, 0), pointInPolygon(SQUARE, 0, 2)]).toEqual([true, true])
    expect([pointInPolygon(SQUARE, 2, 4), pointInPolygon(SQUARE, 4, 2)]).toEqual([false, false])
    expect([pointInPolygon(SQUARE, 0, 0), pointInPolygon(SQUARE, 4, 4)]).toEqual([true, false])
  })

  it('finds the notch of a concave ring outside', () => {
    expect(pointInPolygon(CONCAVE_U, 3, 4)).toBe(false)
    expect(pointInPolygon(CONCAVE_U, 1, 4)).toBe(true)
  })
})

const SEGMENTS: [string, XY, XY][] = [
  ['horizontal', [0, 0], [4, 0]],
  ['diagonal, odd decimals', [0.1, 0.2], [1.3, 2.9]],
  ['backwards', [7.3, 4.4], [1.1, 2.2]],
  ['zero length', [1.5, -0.5], [1.5, -0.5]],
  ['zero length at the origin', [0, 0], [0, 0]],
  ['tiny', [1, 1], [1 + 1e-12, 1]],
]

const segmentProbes = (a: XY, b: XY): XY[] => [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ...probes([a, b, [a[0] + 1, b[1] + 2]])]

describe('pointSegmentDistance: the merged copies give the same answer', () => {
  for (const [name, a, b] of SEGMENTS) {
    it(`on a ${name} segment, beside it, past each end and on it`, () => {
      for (const p of segmentProbes(a, b)) {
        const want = pointSegmentDistance(p, a, b)
        for (const got of [stairWingSegDist(p, a, b), routeAutoPointSegDist(p, a, b)]) {
          expect(Object.is(got, want), `${name} at ${p}: ${got} vs ${want}`).toBe(true)
        }
      }
    })
  }

  it('measures to the nearer end past a segment, and to the point for a zero-length one', () => {
    expect(pointSegmentDistance([7, 4], [0, 0], [4, 0])).toBe(5)
    expect(pointSegmentDistance([4.5, 3.5], [1.5, -0.5], [1.5, -0.5])).toBe(5)
  })

  it('differs from the roof and earthworks form in the last bits, which is why those copies stay', () => {
    const p: XY = [0.3, 0.7]
    const a: XY = [0.1, 0.2]
    const b: XY = [1.3, 2.9]
    expect(roofSegDist(p, a, b)).not.toBe(pointSegmentDistance(p, a, b))
    expect(roofSegDist(p, a, b)).toBeCloseTo(pointSegmentDistance(p, a, b), 12)
  })
})

describe('siteGeom.distToSegment: svgDims uses it now', () => {
  for (const [name, a, b] of SEGMENTS) {
    it(`gives svgDims' old answer on a ${name} segment`, () => {
      for (const p of segmentProbes(a, b)) expect(Object.is(distToSegment(p, a, b), svgDimsToSegment(p, a, b))).toBe(true)
    })
  }
})
