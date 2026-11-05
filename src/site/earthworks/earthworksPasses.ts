import { elevationAt } from '../terrain'
import type { SitePoint, Terrain } from '../types'
import { pondLevelOf, smoothMax, smoothstep, type EarthEdge } from './earthworksSpec'
import { EARTH_CLASS, type BuildingEarthOp, type CellRect, type Ground, type PondEarthOp, type PondWater } from './earthworksTypes'

/**
 * The legacy earthRebuild passes on one raster, in their old order: bench
 * and cut, berms, nothing filled inside a building, then ponds. Each pass
 * works only over its object's box and keeps the signed distances it
 * needs for the next.
 */

const FT = 0.3048

/** Samples per patch before the raster is coarsened (legacy 110 000), and the finest split of a terrain cell. */
const MAX_SAMPLES = 110000
const FINEST_SPLIT = 8
/** Legacy crest rounding radius and the blend widths of the passes, metres. */
const CREST_ROUND_M = 1
const FILL_FLAT_M = 0.3
const FILL_BLEND_M = 0.3
const BERM_BLEND_M = 0.5
const WALL_CUT_IN_M = 0.2
const WALL_CUT_OUT_M = 0.5
const COURT_EDGE_M = 0.3
/** A berm reaches this far in under the wall line, no further. */
const BERM_INSIDE_M = 0.2
const INSIDE_M = 0.25
const POND_SKIM_M = 0.02
const WET_MARGIN_M = 1.1

export interface Box {
  readonly x0: number
  readonly x1: number
  readonly n0: number
  readonly n1: number
}

/** A building op with everything its passes need, worked out once. */
export interface PreparedBuilding {
  readonly kind: 'building'
  readonly op: BuildingEarthOp
  readonly polys: readonly Float64Array[]
  readonly courts: readonly Float64Array[]
  /** The same courts as outlines, and the main-mass edge each lies against, for the plan sheet. */
  readonly courtPolys: readonly (readonly SitePoint[])[]
  readonly courtSides: readonly number[]
  readonly berms: readonly EarthEdge[]
  readonly floorC: number
  readonly crestTop: number
  readonly doCut: boolean
  readonly box: Box
}

export interface PreparedPond {
  readonly kind: 'pond'
  readonly op: PondEarthOp
  readonly poly: Float64Array
  readonly box: Box
}

export type Prepared = PreparedBuilding | PreparedPond

/** Squared distance from a point to a segment. */
function seg2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const L = dx * dx + dy * dy
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const ex = ax + t * dx - px
  const ey = ay + t * dy - py
  return ex * ex + ey * ey
}

/** Legacy eSD: signed distance to one closed outline (flat x, n pairs), negative inside. */
export function sdPoly(P: Float64Array, x: number, n: number): number {
  let d = Infinity
  let inside = false
  const m = P.length / 2
  for (let i = 0, j = m - 1; i < m; j = i++) {
    const ax = P[2 * i]
    const an = P[2 * i + 1]
    const bx = P[2 * j]
    const bn = P[2 * j + 1]
    if (an > n !== bn > n && x < ((bx - ax) * (n - an)) / (bn - an) + ax) inside = !inside
    const q = seg2(x, n, ax, an, bx, bn)
    if (q < d) d = q
  }
  d = Math.sqrt(d)
  return inside ? -d : d
}

/** Legacy eSDu: the least signed distance to any of the outlines. */
function sdUnion(polys: readonly Float64Array[], x: number, n: number): number {
  let d = Infinity
  for (const P of polys) d = Math.min(d, sdPoly(P, x, n))
  return d
}

function polyArea(P: readonly SitePoint[]): number {
  let a = 0
  P.forEach((p, i) => {
    const q = P[(i + 1) % P.length]
    a += p[0] * q[1] - q[0] * p[1]
  })
  return Math.abs(a) / 2
}

/** Mutable raster while the passes run; frozen into an EarthField at the end. */
export interface Raster {
  readonly rect: CellRect
  readonly x0: number
  readonly n0: number
  readonly h: number
  readonly ni: number
  readonly nj: number
  readonly z: Float32Array
  readonly zb: Float32Array
  readonly cls: Uint8Array
  readonly str: Float32Array
}

export function newRaster(t: Terrain, rect: CellRect): Raster {
  const ci = Math.max(1, rect.c1 - rect.c0)
  const cj = Math.max(1, rect.r1 - rect.r0)
  let sub = FINEST_SPLIT
  while (sub > 2 && (ci * sub + 1) * (cj * sub + 1) > MAX_SAMPLES) sub /= 2
  const h = t.spacing / sub
  const ni = ci * sub
  const nj = cj * sub
  const x0 = t.x0 + rect.c0 * t.spacing
  const n0 = t.n0 + rect.r0 * t.spacing
  const N = (ni + 1) * (nj + 1)
  const z = new Float32Array(N)
  for (let J = 0; J <= nj; J++) for (let I = 0; I <= ni; I++) z[J * (ni + 1) + I] = elevationAt(t, x0 + I * h, n0 + J * h)
  return { rect, x0, n0, h, ni, nj, z, zb: z.slice(), cls: new Uint8Array(N), str: new Float32Array(N) }
}

/** The samples of a raster inside a box, clamped to the raster. */
interface Range {
  readonly I0: number
  readonly I1: number
  readonly J0: number
  readonly J1: number
}

function rangeOf(R: Raster, b: Box): Range {
  return {
    I0: Math.max(0, Math.floor((b.x0 - R.x0) / R.h)),
    I1: Math.min(R.ni, Math.ceil((b.x1 - R.x0) / R.h)),
    J0: Math.max(0, Math.floor((b.n0 - R.n0) / R.h)),
    J1: Math.min(R.nj, Math.ceil((b.n1 - R.n0) / R.h)),
  }
}

/** Per-building signed distances kept from pass 1 for the berm, inside and wall passes. */
export interface Distances {
  readonly r: Range
  readonly rw: number
  /** To the masses. */
  readonly sdA: Float32Array
  /** To the masses and courts, less the margin: the cut edge is its zero line. */
  readonly sdC: Float32Array
}

/** Pass 1: the fill bench (earth support) and the cut (footprint + margin + court), keeping the signed distances. */
export function benchAndCut(R: Raster, p: PreparedBuilding): Distances {
  const e = p.op.spec
  const r = rangeOf(R, p.box)
  // a building off the survey grid can leave an empty range (I0 past I1)
  const rw = Math.max(0, r.I1 - r.I0 + 1)
  const size = rw * Math.max(0, r.J1 - r.J0 + 1)
  const sdA = new Float32Array(size)
  const sdC = new Float32Array(size)
  const margin = e.margin * FT
  const W = R.ni + 1
  for (let J = r.J0; J <= r.J1; J++) {
    for (let I = r.I0; I <= r.I1; I++) {
      const x = R.x0 + I * R.h
      const n = R.n0 + J * R.h
      const k = J * W + I
      const q = (J - r.J0) * rw + (I - r.I0)
      const sA = sdUnion(p.polys, x, n)
      const sC = (p.courts.length ? Math.min(sA, sdUnion(p.courts, x, n)) : sA) - margin
      sdA[q] = sA
      sdC[q] = sC
      if (e.fill) {
        const zf = sA <= FILL_FLAT_M ? p.floorC : p.floorC - (sA - FILL_FLAT_M) / e.slope
        if (zf > R.z[k] - FILL_BLEND_M) R.z[k] = smoothMax(R.z[k], zf, FILL_BLEND_M)
      }
      if (!p.doCut) continue
      const zc = e.walls
        ? sC <= WALL_CUT_IN_M
          ? p.floorC
          : sC >= WALL_CUT_OUT_M
            ? Infinity
            : p.floorC + (R.z[k] - p.floorC) * smoothstep(WALL_CUT_IN_M, WALL_CUT_OUT_M, sC)
        : p.floorC + Math.max(0, sC) / e.slope
      if (zc < R.z[k]) {
        R.z[k] = zc
        if (sC <= COURT_EDGE_M) R.cls[k] = EARTH_CLASS.court
      }
    }
  }
  return { r, rw, sdA, sdC }
}

/** Pass 2: berms against the chosen walls of the main mass, a flat crest, a rounded shoulder and a smooth toe. */
export function berm(R: Raster, p: PreparedBuilding, d: Distances): void {
  if (!p.berms.length) return
  const e = p.op.spec
  const crest = e.crest * FT
  const W = R.ni + 1
  for (let J = d.r.J0; J <= d.r.J1; J++) {
    for (let I = d.r.I0; I <= d.r.I1; I++) {
      if (d.sdA[(J - d.r.J0) * d.rw + (I - d.r.I0)] < -BERM_INSIDE_M) continue
      const x = R.x0 + I * R.h
      const n = R.n0 + J * R.h
      const k = J * W + I
      let d2 = Infinity
      for (const ed of p.berms) d2 = Math.min(d2, seg2(x, n, ed.a[0], ed.a[1], ed.b[0], ed.b[1]))
      const u = Math.sqrt(d2) - crest
      const drop = (u <= 0 ? 0 : u < CREST_ROUND_M ? (u * u) / (2 * CREST_ROUND_M) : u - CREST_ROUND_M / 2) / e.slope
      const surf = p.crestTop - drop
      if (surf <= R.z[k] - BERM_BLEND_M) continue
      const nz = smoothMax(R.z[k], surf, BERM_BLEND_M)
      if (nz > R.z[k] + 0.01) {
        R.z[k] = nz
        if (R.cls[k] === EARTH_CLASS.court) R.cls[k] = EARTH_CLASS.bermOverCourt
      }
    }
  }
}

/** Pass 3: never fill a building: the ground inside every footprint stays at or below its cut floor. */
export function keepInsideDown(R: Raster, p: PreparedBuilding, d: Distances): void {
  const W = R.ni + 1
  for (let J = d.r.J0; J <= d.r.J1; J++) {
    for (let I = d.r.I0; I <= d.r.I1; I++) {
      if (d.sdA[(J - d.r.J0) * d.rw + (I - d.r.I0)] >= -INSIDE_M) continue
      const k = J * W + I
      if (R.z[k] > p.floorC) R.z[k] = p.floorC
    }
  }
}

/** Pass 4: a pond: flat water at the lowest rim point, a soft bowl under it, a graded wet margin outside. */
export function pond(R: Raster, p: PreparedPond, ground: Ground): PondWater {
  const level = pondLevelOf(p.op.poly, ground)
  const D = p.op.depth
  const ease = Math.max(0.3, Math.min(1.4, Math.sqrt(polyArea(p.op.poly)) * 0.22))
  const r = rangeOf(R, p.box)
  const W = R.ni + 1
  for (let J = r.J0; J <= r.J1; J++) {
    for (let I = r.I0; I <= r.I1; I++) {
      const k = J * W + I
      const s = sdPoly(p.poly, R.x0 + I * R.h, R.n0 + J * R.h)
      if (s < 0) {
        const t = smoothstep(0, ease, -s)
        R.z[k] = Math.min(R.z[k], level - POND_SKIM_M - D * t)
        R.cls[k] = EARTH_CLASS.pond
        R.str[k] = t
      } else if (s < WET_MARGIN_M) {
        const f = smoothstep(0, WET_MARGIN_M, s)
        R.z[k] = Math.min(R.z[k], level + f * (R.z[k] - level))
        if (!R.cls[k]) {
          R.cls[k] = EARTH_CLASS.wet
          R.str[k] = 1 - f
        }
      }
    }
  }
  return { id: p.op.id, poly: p.op.poly, level, depth: D }
}

/** The patch border stays on the survey, so it meets the coarse terrain mesh with no crack. */
export function pinBorder(R: Raster): void {
  const W = R.ni + 1
  for (let I = 0; I <= R.ni; I++) {
    R.z[I] = R.zb[I]
    R.z[R.nj * W + I] = R.zb[R.nj * W + I]
  }
  for (let J = 0; J <= R.nj; J++) {
    R.z[J * W] = R.zb[J * W]
    R.z[J * W + R.ni] = R.zb[J * W + R.ni]
  }
}
