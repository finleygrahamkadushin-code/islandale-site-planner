import type { LocalPoint } from '../footprint'
import { addPolygon, emptyMesh, type MeshData, type V3 } from '../geom'
import type { RailStyle } from './railEdits'
import { M_PER_FT as FT } from '../../site/units'

const IN = 0.0254
export const GUARD_HEIGHT_M = 36 * IN

/**
 * Rigid infill (balusters, pickets) leaves at most this clear, under the
 * 4 in sphere rule (IRC R312.1.3), with half an inch to spare (R3.7: the
 * old 4.00 in exactly let a 4 in sphere through).
 */
export const INFILL_CLEAR_M = 3.5 * IN
/** Cables stretch under load, so they are set closer: at most 3 in clear. */
export const CABLE_CLEAR_M = 3 * IN

// wood (the new app's guard): top and bottom rails, posts about every 6 ft, balusters 3.5 in apart
const TOP_RAIL_M = 0.06
const BOTTOM_RAIL_M = 0.04
const BOTTOM_RAIL_Y_M = 3.5 * IN
export const WOOD_BALUSTER_M = 0.035
export const WOOD_BALUSTER_PITCH_M = INFILL_CLEAR_M + WOOD_BALUSTER_M
const POST_GAP_M = 6 * FT
const POST_M = 0.09

// steel, cable and glass (legacy extRailPath): members are 4-sided prisms of circumradius r, so squares of side r·√2
const side = (r: number) => r * Math.SQRT2
const METAL_POST_R = 0.025
const METAL_TOP_R = 0.025
const CABLE_TOP_R = 0.02
/** The cable guard's top rail, its side (m). */
export const CABLE_TOP_M = side(CABLE_TOP_R)
const STEEL_BOTTOM_R = 0.018
/** The steel guard's bottom rail stands this far up: the gap under it stays under 4 in. */
export const STEEL_BOTTOM_Y_M = 3.5 * IN
const PICKET_R = 0.008
export const STEEL_PICKET_M = side(PICKET_R)
const CABLE_R = 0.004
export const CABLE_M = side(CABLE_R)
const CABLE_POST_GAP_M = 1.2
const POST_GAP_METAL_M = 1.5
const GLASS_T_M = 0.012
const GLASS_INSET_M = 0.06

/** A guard's meshes: the frame (rails, posts, infill bars) and, for glass, the panes. */
export interface RailGeometry {
  readonly frame: MeshData
  readonly glass: MeshData | null
}

type M2 = readonly [number, number]

/**
 * A guard along each run (feet in, local metres out, walking surface at
 * baseY), 36 in high in every style: wood with balusters at 4 in gaps;
 * steel with a bottom rail and pickets; cable with seven cables; glass
 * panes between posts. 'none' draws nothing.
 */
export function buildRail(runs: readonly (readonly LocalPoint[])[], baseY = 0, style: RailStyle = 'wood'): RailGeometry | null {
  if (style === 'none') return null
  const paths = runs.map((run) => run.map(([x, z]) => [x * FT, z * FT] as const)).filter((p) => p.length >= 2)
  if (style === 'wood') {
    const frame = emptyMesh()
    paths.forEach((p) => woodRun(frame, p, baseY))
    return { frame, glass: null }
  }
  const frame = emptyMesh()
  const glass = style === 'glass' ? emptyMesh() : null
  paths.forEach((p) => metalRun(frame, glass, p, baseY, style))
  return { frame, glass }
}

function woodRun(mesh: MeshData, pts: readonly M2[], baseY: number): void {
  let sincePost = Infinity
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-4) continue
    addBar(mesh, a, b, baseY + GUARD_HEIGHT_M - TOP_RAIL_M, TOP_RAIL_M, TOP_RAIL_M)
    addBar(mesh, a, b, baseY + BOTTOM_RAIL_Y_M, BOTTOM_RAIL_M, BOTTOM_RAIL_M)
    for (let d = 0; d < len; d += WOOD_BALUSTER_PITCH_M) {
      const p = lerp(a, b, d / len)
      if (sincePost >= POST_GAP_M) {
        addPost(mesh, p, baseY, baseY + GUARD_HEIGHT_M, POST_M)
        sincePost = 0
      } else addPost(mesh, p, baseY + BOTTOM_RAIL_Y_M, baseY + GUARD_HEIGHT_M - TOP_RAIL_M, WOOD_BALUSTER_M)
      sincePost += WOOD_BALUSTER_PITCH_M
    }
  }
  addPost(mesh, pts[pts.length - 1], baseY, baseY + GUARD_HEIGHT_M, POST_M)
}

function metalRun(frame: MeshData, glass: MeshData | null, pts: readonly M2[], y0: number, style: 'steel' | 'cable' | 'glass'): void {
  const H = GUARD_HEIGHT_M
  const cable = style === 'cable'
  const top = side(cable ? CABLE_TOP_R : METAL_TOP_R)
  const total = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0)
  if (total < 1e-4) return
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-4) continue
    addBar(frame, a, b, y0 + H - top, top, top)
    if (style === 'steel') addBar(frame, a, b, y0 + STEEL_BOTTOM_Y_M, side(STEEL_BOTTOM_R), side(STEEL_BOTTOM_R))
    if (cable) for (const y of cableHeights(y0)) addBar(frame, a, b, y - CABLE_M / 2, CABLE_M, CABLE_M)
    if (glass) addPane(glass, a, b, y0 + GLASS_INSET_M, Math.max(0.1, H - 2 * GLASS_INSET_M))
  }
  // posts spread evenly along the whole run, both ends included
  const np = Math.max(1, Math.ceil(total / (cable ? CABLE_POST_GAP_M : POST_GAP_METAL_M)))
  for (let k = 0; k <= np; k++) addPost(frame, at(pts, (total * k) / np), y0, y0 + H - top, side(METAL_POST_R))
  if (style === 'steel') {
    const nq = picketCount(total)
    for (let k = 1; k < nq; k++) addPost(frame, at(pts, (total * k) / nq), y0 + STEEL_BOTTOM_Y_M, y0 + H - top, STEEL_PICKET_M)
  }
}

/** Steel pickets: the bays a run of `total` metres is split into, so none is wider than 3.5 in clear (the legacy floor(total / 0.11) gave up to 4.3 in). */
export const picketCount = (total: number): number => Math.max(1, Math.ceil(total / (INFILL_CLEAR_M + STEEL_PICKET_M) - 1e-9))

/** The cable guard's cable centres over a surface at y0: evenly from the surface to the top rail, no gap over 3 in (the legacy seven cables left 4 in between and 5.3 in under the rail). */
export function cableHeights(y0: number): number[] {
  const span = GUARD_HEIGHT_M - CABLE_TOP_M
  const n = Math.ceil((span - CABLE_CLEAR_M) / (CABLE_CLEAR_M + CABLE_M) - 1e-9)
  const pitch = (span - n * CABLE_M) / (n + 1)
  return Array.from({ length: n }, (_, k) => y0 + (k + 1) * pitch + k * CABLE_M + CABLE_M / 2)
}

const lerp = (a: M2, b: M2, f: number): M2 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]

/** The point s metres along a polyline. */
function at(pts: readonly M2[], s: number): M2 {
  let left = s
  for (let i = 0; i + 1 < pts.length; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
    if (left <= len || i + 2 === pts.length) return lerp(pts[i], pts[i + 1], len ? Math.min(1, left / len) : 0)
    left -= len
  }
  return pts[pts.length - 1]
}

/** A glass pane along a→b, its bottom at y. */
function addPane(mesh: MeshData, a: M2, b: M2, y: number, h: number): void {
  addBar(mesh, a, b, y, GLASS_T_M, h)
}

/** A horizontal bar from a to b (metres), w wide and h high, its bottom at y. */
function addBar(mesh: MeshData, a: M2, b: M2, y: number, w: number, h: number): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  const n = [-t[1] * (w / 2), t[0] * (w / 2)]
  const corner = (p: M2, s: number, yy: number): V3 => [p[0] + n[0] * s, yy, p[1] + n[1] * s]
  addBox(mesh, [corner(a, -1, y), corner(b, -1, y), corner(b, 1, y), corner(a, 1, y)], h)
}

/** A square upright at p (metres) from y0 to y1. */
function addPost(mesh: MeshData, p: M2, y0: number, y1: number, size: number): void {
  const s = size / 2
  addBox(mesh, [[p[0] - s, y0, p[1] - s], [p[0] + s, y0, p[1] - s], [p[0] + s, y0, p[1] + s], [p[0] - s, y0, p[1] + s]], y1 - y0)
}

/** A prism from a bottom quad raised by h. */
function addBox(mesh: MeshData, base: readonly V3[], h: number): void {
  const top = base.map(([x, y, z]) => [x, y + h, z] as const)
  const c: V3 = [base.reduce((s, p) => s + p[0], 0) / 4, base[0][1] + h / 2, base.reduce((s, p) => s + p[2], 0) / 4]
  addPolygon(mesh, top, [0, 1, 0])
  addPolygon(mesh, base, [0, -1, 0])
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    const mid = [(base[i][0] + base[j][0]) / 2, (base[i][2] + base[j][2]) / 2]
    addPolygon(mesh, [base[i], base[j], top[j], top[i]], [mid[0] - c[0], 0, mid[1] - c[2]])
  }
}
