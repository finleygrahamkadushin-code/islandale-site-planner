import { CatmullRomCurve3, LineCurve3, Vector3 } from 'three'
import { addPolygon, emptyMesh, type MeshData, type V3 } from './geom'

/** One point along a boardwalk: site metres, deck-top elevation, and the unit vector to its left. */
export interface WalkSample {
  readonly x: number
  readonly n: number
  readonly e: number
  readonly px: number
  readonly pn: number
}

export interface WalkPath {
  readonly samples: readonly WalkSample[]
  readonly length: number
}

const SAMPLE_M = 0.5
const MAX_SAMPLES = 400
/** Legacy ribbon style: deck depth, column spacing and clearance. */
export const RIBBON_DEPTH_M = 0.22
const COLUMN_SPACING_M = 7
const COLUMN_CLEARANCE_M = 0.4

/**
 * Port of the legacy bridgeCurve(): a centripetal Catmull-Rom through the
 * route points (site x, n metres and deck elevation metres), sampled about
 * every half metre, with the side vector at each sample.
 */
export function boardwalkPath(route: readonly (readonly [number, number, number])[]): WalkPath | null {
  if (route.length < 2) return null
  const pts = route.map(([x, n, e]) => new Vector3(x, e, n))
  const curve = pts.length === 2 ? new LineCurve3(pts[0], pts[1]) : new CatmullRomCurve3(pts, false, 'centripetal')
  const length = curve.getLength()
  const count = Math.max(8, Math.min(MAX_SAMPLES, Math.ceil(length / SAMPLE_M)))
  const raw = evenGrade(curve.getSpacedPoints(count), route)
  const samples = raw.map((v, i) => {
    const a = raw[Math.max(0, i - 1)]
    const b = raw[Math.min(raw.length - 1, i + 1)]
    const tx = b.x - a.x
    const tn = b.z - a.z
    const l = Math.hypot(tx, tn) || 1
    return { x: v.x, n: v.z, e: v.y, px: -tn / l, pn: tx / l }
  })
  return { samples, length }
}

/**
 * A ramp keeps one grade end to end: when the route only falls (or only
 * rises), the deck elevation runs evenly with distance along the curve from
 * the first point's elevation to the last, so the spline's uneven spacing
 * cannot make one stretch steeper than the stated slope. Distance is
 * measured in plan, as a slope is.
 */
function evenGrade(points: Vector3[], route: readonly (readonly [number, number, number])[]): Vector3[] {
  const rises = route.slice(1).map(([, , e], i) => e - route[i][2])
  const oneWay = rises.every((d) => d >= 0) || rises.every((d) => d <= 0)
  if (!oneWay) return points
  const e0 = route[0][2]
  const e1 = route[route.length - 1][2]
  const run = [0]
  for (let i = 1; i < points.length; i++) run.push(run[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z))
  const total = run[run.length - 1] || 1
  return points.map((v, i) => new Vector3(v.x, e0 + ((e1 - e0) * run[i]) / total, v.z))
}

/**
 * Sample indices for the boardwalk's columns (legacy bridgeLayout, ribbon
 * style): about every 7 m, just in from each end, wherever the deck
 * underside is more than 0.4 m above the ground and not inside a building.
 */
export function boardwalkColumns(path: WalkPath, groundAt: (x: number, n: number) => number, inBuilding: (x: number, n: number) => boolean = () => false): number[] {
  const { samples, length } = path
  const last = samples.length - 1
  const step = length / last
  const segs = Math.max(1, Math.ceil(length / COLUMN_SPACING_M))
  const inset = Math.round(1 / step)
  const ok = (i: number) => {
    const s = samples[i]
    return s.e - RIBBON_DEPTH_M - groundAt(s.x, s.n) > COLUMN_CLEARANCE_M && !inBuilding(s.x, s.n)
  }
  const out: number[] = []
  for (let k = 0; k <= segs; k++) {
    const i = k === 0 ? Math.min(last, inset) : k === segs ? Math.max(0, last - inset) : Math.round((k * last) / segs)
    if (ok(i)) out.push(i)
  }
  return out
}

export interface BoardwalkMesh {
  readonly deck: MeshData
  readonly body: MeshData
  readonly glass: MeshData
  readonly steel: MeshData
}

const GLASS_BASE_M = 0.05
const HANDRAIL_M = 1.05
const GLASS_INSET_M = 0.04

/**
 * The legacy ribbon boardwalk in the scene frame (x, elevation, -n),
 * metres: a deck strip on a white body, glass balustrades with steel
 * handrails both sides, and Y columns forking up from the ground.
 */
export function buildBoardwalk(path: WalkPath, widthM: number, columns: readonly number[], groundAt: (x: number, n: number) => number): BoardwalkMesh {
  const hw = Math.max(0.6, widthM / 2)
  const S = path.samples
  const at = (i: number, k: number, dy: number): V3 => {
    const s = S[i]
    return [s.x + s.px * k, s.e + dy, -(s.n + s.pn * k)]
  }
  const line = (k: number, dy: number) => S.map((_, i) => at(i, k, dy))
  const out: BoardwalkMesh = { deck: emptyMesh(), body: emptyMesh(), glass: emptyMesh(), steel: emptyMesh() }
  const TL = line(hw, 0)
  const TR = line(-hw, 0)
  const BL = line(hw, -RIBBON_DEPTH_M)
  const BR = line(-hw, -RIBBON_DEPTH_M)
  const G0 = line(hw - GLASS_INSET_M, GLASS_BASE_M)
  const G1 = line(hw - GLASS_INSET_M, HANDRAIL_M)
  const H0 = line(-hw + GLASS_INSET_M, GLASS_BASE_M)
  const H1 = line(-hw + GLASS_INSET_M, HANDRAIL_M)
  for (let i = 0; i + 1 < S.length; i++) {
    const left: V3 = [S[i].px, 0, -S[i].pn]
    const right: V3 = [-left[0], 0, -left[2]]
    addPolygon(out.deck, [TL[i], TR[i], TR[i + 1], TL[i + 1]], [0, 1, 0])
    addPolygon(out.body, [BL[i], BR[i], BR[i + 1], BL[i + 1]], [0, -1, 0])
    addPolygon(out.body, [TL[i], BL[i], BL[i + 1], TL[i + 1]], left)
    addPolygon(out.body, [TR[i], BR[i], BR[i + 1], TR[i + 1]], right)
    addPolygon(out.glass, [G0[i], G1[i], G1[i + 1], G0[i + 1]], left)
    addPolygon(out.glass, [H0[i], H1[i], H1[i + 1], H0[i + 1]], right)
    for (const [a, b, r] of [[G1, G1, 0.035], [H1, H1, 0.035], [G0, G0, 0.03], [H0, H0, 0.03]] as const) addTube(out.steel, a[i], b[i + 1], r)
  }
  const last = S.length - 1
  for (const [i, dir] of [[0, -1], [last, 1]] as const) {
    const s = S[i]
    const along: V3 = [s.pn * dir, 0, s.px * dir]
    addPolygon(out.body, [TL[i], TR[i], BR[i], BL[i]], along)
  }
  for (const i of columns) {
    const s = S[i]
    const ground = groundAt(s.x, s.n)
    const base: V3 = [s.x, ground - 0.3, -s.n]
    const rise = s.e - RIBBON_DEPTH_M - ground
    const fork = at(i, 0, -RIBBON_DEPTH_M - Math.min(1.4, rise * 0.35))
    addTube(out.steel, base, fork, 0.15)
    addTube(out.steel, fork, at(i, hw * 0.6, -RIBBON_DEPTH_M), 0.085)
    addTube(out.steel, fork, at(i, -hw * 0.6, -RIBBON_DEPTH_M), 0.085)
  }
  return out
}

/** A square tube of half-width r from a to b, any direction (legacy prismGeo with four sides). */
function addTube(mesh: MeshData, a: V3, b: V3, r: number): void {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const L = Math.hypot(d[0], d[1], d[2])
  if (L < 1e-4) return
  const t = [d[0] / L, d[1] / L, d[2] / L]
  const ref = Math.abs(t[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]
  const u = norm([t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]])
  const v = norm([t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]])
  const ring = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([p, q]) => [u[0] * p * r + v[0] * q * r, u[1] * p * r + v[1] * q * r, u[2] * p * r + v[2] * q * r])
  for (let k = 0; k < 4; k++) {
    const o0 = ring[k]
    const o1 = ring[(k + 1) % 4]
    const out: V3 = [(o0[0] + o1[0]) / 2, (o0[1] + o1[1]) / 2, (o0[2] + o1[2]) / 2]
    addPolygon(mesh, [add(a, o0), add(b, o0), add(b, o1), add(a, o1)], out)
  }
}

const add = (p: V3, o: readonly number[]): V3 => [p[0] + o[0], p[1] + o[1], p[2] + o[2]]
const norm = (p: readonly number[]): number[] => {
  const l = Math.hypot(p[0], p[1], p[2]) || 1
  return [p[0] / l, p[1] / l, p[2] / l]
}
