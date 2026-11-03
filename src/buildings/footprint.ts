import { ftToM } from '../site/units'
import type { PlanObject } from '../store/types'
import type { SitePoint } from '../site/types'
import { organicOutline, ribbonOutline } from './organic'

/** Footprint shapes the legacy planner knows. */
export const BOX_SHAPES = ['rect', 'hex', 'oct', 'tri', 'trap', 'para', 'half', 'poly'] as const
export const CURVED_SHAPES = ['ellipse', 'kidney', 'teardrop', 'blob', 'ribbon'] as const

/** A local point in feet about the footprint centre; +z is the front (toward the bay at rotation 0). */
export type LocalPoint = readonly [x: number, z: number]

export interface FootprintParams {
  readonly w: number
  readonly d: number
  readonly shape?: string
  readonly taper?: number
  readonly skew?: number
  readonly pts?: readonly (readonly number[])[]
  /** Kidney bite, 0–1. */
  readonly bend?: number
  /** Teardrop point, 0–1. */
  readonly point?: number
}

/** Port of the legacy `massPoly`: the footprint polygon in local feet. */
export function localFootprint(p: FootprintParams): readonly LocalPoint[] {
  const { w, d } = p
  const shape = p.shape ?? 'rect'
  if (shape === 'poly') return outlinePolygon(p)
  if (shape === 'ribbon') return ribbonOutline(p)
  if (shape === 'ellipse' || shape === 'kidney' || shape === 'teardrop' || shape === 'blob') return organicOutline({ ...p, shape })
  if (shape === 'hex') {
    return [0, 60, 120, 180, 240, 300].map((a) => {
      const r = (a * Math.PI) / 180
      return [(w / 2) * Math.cos(r), (d / 2) * Math.sin(r)] as const
    })
  }
  if (shape === 'oct') {
    const k = 1 / Math.cos(Math.PI / 8)
    return [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((a) => {
      const r = (a * Math.PI) / 180
      return [(w / 2) * Math.cos(r) * k, (d / 2) * Math.sin(r) * k] as const
    })
  }
  if (shape === 'tri') return [[-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2]]
  if (shape === 'trap') {
    const t = Math.max(0.15, Math.min(1, p.taper ?? 0.6))
    return [[(-w * t) / 2, -d / 2], [(w * t) / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
  }
  if (shape === 'para') {
    const k = Number.isFinite(p.skew) ? (p.skew as number) : w * 0.3
    return [[-w / 2 + k, -d / 2], [w / 2 + k, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
  }
  if (shape === 'half') {
    return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 6], [w / 4, d / 2], [-w / 4, d / 2], [-w / 2, d / 6]]
  }
  return rectangle(w, d)
}

function rectangle(w: number, d: number): readonly LocalPoint[] {
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
}

function outlinePolygon(p: FootprintParams): readonly LocalPoint[] {
  const pts = (p.pts ?? [])
    .filter((q): q is readonly [number, number] => q.length >= 2 && Number.isFinite(q[0]) && Number.isFinite(q[1]))
    .map(([x, z]) => [x, z] as const)
  if (pts.length < 3) return rectangle(p.w || 10, p.d || 10)
  const deduped = pts.filter((q, i) => {
    const next = pts[(i + 1) % pts.length]
    return Math.hypot(next[0] - q[0], next[1] - q[1]) > 1e-3
  })
  return signedArea(deduped) < 0 ? [...deduped].reverse() : deduped
}

export function signedArea(poly: readonly LocalPoint[]): number {
  let twice = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]
    const [x2, z2] = poly[(i + 1) % poly.length]
    twice += x1 * z2 - x2 * z1
  }
  return twice / 2
}

/** Local feet → site metres, the legacy `localToWorld`: rotation CCW in the east/north plane, +z front → south. */
export function localToSite(position: { x: number; n: number }, rotationDeg: number, [lx, lz]: LocalPoint): SitePoint {
  const a = (rotationDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const px = ftToM(lx)
  const pn = -ftToM(lz)
  return [position.x + px * c - pn * s, position.n + px * s + pn * c]
}

/** Site metres → local feet, inverse of `localToSite`. */
export function siteToLocal(position: { x: number; n: number }, rotationDeg: number, [x, n]: SitePoint): LocalPoint {
  const a = (rotationDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const dx = x - position.x
  const dn = n - position.n
  const px = dx * c + dn * s
  const pn = -dx * s + dn * c
  return [px / 0.3048, -pn / 0.3048]
}

export function footprintParams(o: PlanObject): FootprintParams {
  const p = o.params
  return {
    w: num(p.w, 10),
    d: num(p.d, 10),
    shape: typeof p.shape === 'string' ? p.shape : 'rect',
    taper: typeof p.taper === 'number' ? p.taper : undefined,
    skew: typeof p.skew === 'number' ? p.skew : undefined,
    pts: Array.isArray(p.pts) ? (p.pts as number[][]) : undefined,
    bend: typeof p.bend === 'number' ? p.bend : undefined,
    point: typeof p.point === 'number' ? p.point : undefined,
  }
}

/** Footprint corners of a plan object in the site frame, metres. */
export function siteFootprint(o: PlanObject): readonly SitePoint[] {
  return localFootprint(footprintParams(o)).map((q) => localToSite(o.position, o.rotation, q))
}

export const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
