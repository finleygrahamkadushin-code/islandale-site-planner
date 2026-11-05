import { CatmullRomCurve3, LineCurve3, Vector3 } from 'three'
import { ftToM } from '../../site/units'
import type { PlanObject } from '../../store/types'

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

/** Column options per bridge style (legacy bridgeLayout): spacing along the deck and the deck's depth, metres. */
export interface ColumnOptions {
  readonly spacingM?: number
  readonly depthM?: number
}

/**
 * Sample indices for a bridge's columns (legacy bridgeLayout): one about
 * every `spacingM` (7 m for the ribbon, 12 m for the truss), the end ones
 * just in from each end, wherever the deck underside is more than 0.4 m
 * above the ground and not inside a building.
 */
export function boardwalkColumns(
  path: WalkPath,
  groundAt: (x: number, n: number) => number,
  inBuilding: (x: number, n: number) => boolean = () => false,
  { spacingM = COLUMN_SPACING_M, depthM = RIBBON_DEPTH_M }: ColumnOptions = {},
): number[] {
  const { samples, length } = path
  const last = samples.length - 1
  const step = length / last
  const segs = Math.max(1, Math.ceil(length / spacingM))
  const inset = Math.round(1 / step)
  const ok = columnFits(path, groundAt, inBuilding, depthM)
  const out: number[] = []
  for (let k = 0; k <= segs; k++) {
    const i = k === 0 ? Math.min(last, inset) : k === segs ? Math.max(0, last - inset) : Math.round((k * last) / segs)
    if (ok(i)) out.push(i)
  }
  return out
}

/** Whether a column can stand under sample i: the deck underside well off the ground and not over a building. */
export function columnFits(
  path: WalkPath,
  groundAt: (x: number, n: number) => number,
  inBuilding: (x: number, n: number) => boolean,
  depthM: number,
): (i: number) => boolean {
  return (i) => {
    const s = path.samples[i]
    return s.e - depthM - groundAt(s.x, s.n) > COLUMN_CLEARANCE_M && !inBuilding(s.x, s.n)
  }
}

/** Route points in the site frame: position + relative route, rotated with the object; elevations in metres. */
export function routePoints(o: PlanObject): readonly (readonly [number, number, number])[] {
  const route = Array.isArray(o.params.route) ? (o.params.route as (readonly number[])[]) : []
  const a = (o.rotation * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return route
    .filter((p) => p.length >= 3)
    .map(([dx, dn, elevFt]) => [o.position.x + dx * c - dn * s, o.position.n + dx * s + dn * c, ftToM(elevFt)] as const)
}
