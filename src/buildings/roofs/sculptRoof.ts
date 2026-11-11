import { ShapeUtils, Vector2 } from 'three'
import { seededRandom } from '../../site/objects/treeShapes'
import { isRoofFinish, type RoofFinish } from '../paint/finishes'
import { pointInPolygon } from '../foundation/foundation'
import type { LocalPoint } from '../footprint'
import { addPolygon, emptyMesh, type MeshData, type V3 } from '../geom'
import type { Mass } from '../masses'
import { polyOffset, signedAreaOf } from '../organic'

/**
 * Sculpted roofs (legacy roofSurface, roofIsolines, roofLineSets, roofTufts,
 * sculptRoof): dome, vault, shell, saddle and sod on any outline. The roof
 * outline (the walls grown by the overhang) is triangulated by a square grid
 * clipped to it, so the mesh is regular inside and exact on the edge. Dome
 * and sod heights come from a membrane solve (a pressurised skin: a spherical
 * cap on a circle, a pillow on a rectangle, a bean on a kidney); vault and
 * shell from the outline's chord through each point; saddle is a hyperbolic
 * paraboloid over the box. Everything is mass-local metres with y 0 at the
 * wall top, like buildRoof. Pure.
 */

type P2 = readonly [number, number]
type Tri = readonly [number, number, number]

export const SCULPTED_ROOFS = ['dome', 'vault', 'shell', 'saddle', 'sod'] as const
export type SculptedType = (typeof SCULPTED_ROOFS)[number]
export const isSculpted = (type: string): type is SculptedType => (SCULPTED_ROOFS as readonly string[]).includes(type)

const FT = 0.3048
/** Grid cells across the longer side of the outline (legacy res). */
const RES = 30
const SLAB_M: Readonly<Record<SculptedType, number>> = { dome: 0.18, vault: 0.18, shell: 0.2, saddle: 0.15, sod: 0.42 }
const GLASS_SLAB_M = 0.07
/** Sod laid over a dome, vault, shell or saddle. */
const SOD_OVER_M = 0.36
const SOR_SWEEPS = 600
const LINE_LIFT_M = 0.012
const INFILL_MIN_M = 0.02
const MULLION_GAP_M = 1.5
const MULLION_MIN_M = 0.25
const STRUT_INSET_M = 0.3
const STRUT_GAP_M = 2.4
const STRUT_MIN_M = 0.2
const STRUT_TOP_R = 0.045
const STRUT_FOOT_R = 0.07
const STRUT_SIDES = 8
const TUFT_EDGE_M = 0.35
const GREENS = ['#3f6428', '#557d33', '#6f9440', '#8e9a4c'] as const
const BLOOMS = ['#e9d45c', '#f2eee0', '#9f7fc6', '#d9734e'] as const

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** A roof's finish (legacy roofMatOf): its own roofMat, else the building's on the main mass, else sod on a sod roof; null for the standard finish. */
export function roofFinishOf(m: Pick<Mass, 'roofMat' | 'roof'> & Partial<Pick<Mass, 'main'>>, buildingRoofMat?: string): RoofFinish | null {
  const r = m.roofMat ?? (m.main ? buildingRoofMat : undefined) ?? (m.roof === 'sod' ? 'sod' : undefined)
  return isRoofFinish(r) ? r : null
}

/** The slab thickness a finish sets, metres (thin glass, a sod layer over another type), or undefined for the type's own. */
export function finishSlabM(type: SculptedType, finish: RoofFinish | null): number | undefined {
  return finish === 'glass' ? GLASS_SLAB_M : finish === 'sod' && type !== 'sod' ? SOD_OVER_M : undefined
}

/** The slab's thickness at the roof's highest point, metres: the finish's, else the type's own (a shell tapers to half at its peak). */
function peakSlabM(type: SculptedType, finish: RoofFinish | null): number {
  return finishSlabM(type, finish) ?? (type === 'shell' ? SLAB_M.shell / 2 : SLAB_M[type])
}

/**
 * Highest point of a sculpted roof above the wall top, feet (legacy
 * sculptRiseFt, used by the height check), with the slab as the roof is
 * built: its finish's thickness, which the legacy ignored.
 */
export function sculptRiseFt(m: Pick<Mass, 'roof' | 'pitch' | 'ridge' | 'overhang' | 'w' | 'd' | 'curl' | 'roofMat'>): number {
  const p = (m.pitch ?? 6) / 12
  const oh = m.overhang || 0
  const w = m.w + 2 * oh
  const d = m.d + 2 * oh
  const c = clamp(m.curl ?? 0.5, 0, 1)
  const th = (isSculpted(m.roof) ? peakSlabM(m.roof, roofFinishOf(m)) : SLAB_M.dome) / FT
  if (m.roof === 'vault') return (p * (m.ridge === 'z' ? w : d)) / 2 + th
  if (m.roof === 'shell') return ((p * (m.ridge === 'z' ? w : d)) / 2) * (0.75 + 0.5 * c) + th
  return (p * Math.min(w, d)) / 2 + th
}

// ---------- the height field ----------

export interface SurfaceOptions {
  /** Rise per 12 of run. */
  readonly pitch?: number
  readonly ridge?: 'x' | 'z'
  /** Shell curl, 0–1 (default 0.5). */
  readonly curl?: number
  /** Slab thickness, metres; the type's own when missing. */
  readonly th?: number
  /** Grid cells across the longer side. */
  readonly res?: number
}

/** A boundary point of the roof with its soffit height and slab thickness. */
export interface RingPoint {
  readonly x: number
  readonly z: number
  readonly h: number
  readonly th: number
}

export interface SurfaceSample {
  readonly h: number
  readonly th: number
  readonly inside: boolean
}

/** Legacy roofSurface's result: plan vertices and upward-wound triangles with soffit height H, slab thickness TH and the linework fields F. */
export interface RoofSurface {
  readonly type: SculptedType
  /** The outline, metres, duplicate points removed. */
  readonly P: readonly P2[]
  readonly V: readonly P2[]
  readonly T: readonly Tri[]
  readonly H: readonly number[]
  readonly TH: readonly number[]
  readonly F: readonly P2[]
  readonly ring: readonly RingPoint[]
  /** Soffit height and thickness under a plan point. */
  readonly at: (x: number, z: number) => SurfaceSample
  readonly bbox: readonly [x0: number, x1: number, z0: number, z1: number]
  readonly span: number
  readonly S: number
  /** Grid cell, metres. */
  readonly c: number
  readonly H0: number
  readonly Hl: number
  readonly ridge: 'x' | 'z'
}

/** Drop repeated points and a closing duplicate (legacy roofClean). */
function clean(P: readonly P2[]): P2[] {
  const out: P2[] = []
  for (const p of P) {
    const q = out[out.length - 1]
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push([+p[0], +p[1]])
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop()
  return out
}

interface Grid {
  readonly c: number
  readonly nx: number
  readonly nz: number
  readonly gx0: number
  readonly gz0: number
  readonly ins: Uint8Array
  readonly V: readonly P2[]
  readonly T: readonly Tri[]
  /** Grid node under each vertex, or -1 for a vertex on the outline. */
  readonly node: readonly number[]
  readonly cellT: ReadonlyMap<number, readonly number[]>
}

/** Keep the part of a polygon on one side of an axis line (Sutherland–Hodgman). */
function clipAxis(poly: readonly P2[], ax: 0 | 1, val: number, ge: boolean): P2[] {
  const out: P2[] = []
  poly.forEach((a, k) => {
    const b = poly[(k + 1) % poly.length]
    const ia = ge ? a[ax] >= val : a[ax] <= val
    const ib = ge ? b[ax] >= val : b[ax] <= val
    if (ia) out.push(a)
    if (ia !== ib) {
      const t = (val - a[ax]) / (b[ax] - a[ax])
      const p: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      p[ax] = val
      out.push(p)
    }
  })
  return out
}

/** A square grid clipped to the outline: whole cells inside, clipped and ear-cut cells on the edge. */
function clippedGrid(P: readonly P2[], x0: number, z0: number, sx: number, sz: number, c: number): Grid {
  const nx = Math.ceil(sx / c) + 2
  const nz = Math.ceil(sz / c) + 2
  const NX = nx + 1
  const gx0 = x0 - c * 0.5
  const gz0 = z0 - c * 0.5
  const nid = (i: number, j: number) => j * NX + i
  const GX = (i: number) => gx0 + i * c
  const GZ = (j: number) => gz0 + j * c
  const ins = new Uint8Array(NX * (nz + 1))
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) ins[nid(i, j)] = pointInPolygon(P, GX(i), GZ(j)) ? 1 : 0
  const edgeCells = new Set<number>()
  P.forEach((a, e) => {
    const b = P[(e + 1) % P.length]
    const i0 = Math.floor((Math.min(a[0], b[0]) - gx0) / c)
    const i1 = Math.floor((Math.max(a[0], b[0]) - gx0) / c)
    const j0 = Math.floor((Math.min(a[1], b[1]) - gz0) / c)
    const j1 = Math.floor((Math.max(a[1], b[1]) - gz0) / c)
    for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) edgeCells.add(j * nx + i)
  })
  const V: P2[] = []
  const node: number[] = []
  const keys = new Map<string, number>()
  const T: Tri[] = []
  const cellT = new Map<number, number[]>()
  const vid = (x: number, z: number): number => {
    const fi = (x - gx0) / c
    const fj = (z - gz0) / c
    const key = `${Math.round(fi * 1e5)}_${Math.round(fj * 1e5)}`
    const hit = keys.get(key)
    if (hit !== undefined) return hit
    const id = V.length
    keys.set(key, id)
    V.push([x, z])
    const ri = Math.round(fi)
    const rj = Math.round(fj)
    const onNode = Math.abs(fi - ri) < 1e-6 && Math.abs(fj - rj) < 1e-6 && ri >= 0 && rj >= 0 && ri <= nx && rj <= nz
    node.push(onNode ? nid(ri, rj) : -1)
    return id
  }
  // wound so the face normal points up
  const tri = (cell: number, a: number, b: number, d: number) => {
    const [A, B, C] = [V[a], V[b], V[d]]
    const cr = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])
    if (Math.abs(cr) < 1e-12) return
    const list = cellT.get(cell) ?? []
    cellT.set(cell, [...list, T.length])
    T.push(cr > 0 ? [a, d, b] : [a, b, d])
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cell = j * nx + i
      if (!edgeCells.has(cell)) {
        if (!ins[nid(i, j)]) continue
        const a = vid(GX(i), GZ(j))
        const b = vid(GX(i + 1), GZ(j))
        const d = vid(GX(i + 1), GZ(j + 1))
        const e = vid(GX(i), GZ(j + 1))
        tri(cell, a, b, d)
        tri(cell, a, d, e)
        continue
      }
      const pc = clipAxis(clipAxis(clipAxis(clipAxis(P, 0, GX(i), true), 0, GX(i + 1), false), 1, GZ(j), true), 1, GZ(j + 1), false)
      if (pc.length < 3) continue
      const ct = pc.map((p) => new Vector2(p[0], p[1]))
      let faces: number[][]
      try {
        faces = ShapeUtils.triangulateShape(ct, [])
      } catch {
        continue // a degenerate sliver of outline: leave the cell open, as the old planner does
      }
      // triangulateShape may drop a closing duplicate from ct, so the ids are read after it
      const ids = ct.map((p) => vid(p.x, p.y))
      for (const f of faces) tri(cell, ids[f[0]], ids[f[1]], ids[f[2]])
    }
  }
  return { c, nx, nz, gx0, gz0, ins, V, T, node, cellT }
}

/**
 * The membrane (Poisson Δφ = −1, φ = 0 on the outline) on the grid nodes,
 * with Shortley–Weller arms where the outline cuts between nodes, solved by
 * successive over-relaxation (legacy roofSurface's dome / sod branch).
 */
function membrane(P: readonly P2[], g: Grid): { readonly phi: Float64Array; readonly max: number } {
  const NX = g.nx + 1
  const phi = new Float64Array(NX * (g.nz + 1))
  // distance from (x, z) to the outline along an axis (0: x, 1: z) in one direction, at most one cell
  const ray = (x: number, z: number, ax: 0 | 1, dir: number): number => {
    let best = g.c
    P.forEach((a, e) => {
      const b = P[(e + 1) % P.length]
      const oa = ax ? a[0] - x : a[1] - z
      const ob = ax ? b[0] - x : b[1] - z
      if ((oa > 0) === (ob > 0) && oa !== 0 && ob !== 0) return
      if (oa === ob) return
      const t = oa / (oa - ob)
      const s = (ax ? a[1] + (b[1] - a[1]) * t - z : a[0] + (b[0] - a[0]) * t - x) * dir
      if (s > 1e-9 && s < best) best = s
    })
    return Math.max(best, g.c * 1e-3)
  }
  interface Eq {
    readonly id: number
    readonly a: readonly number[]
    readonly k: readonly number[]
    readonly sum: number
  }
  const eqs: Eq[] = []
  for (let j = 1; j < g.nz; j++) {
    for (let i = 1; i < g.nx; i++) {
      const id = j * NX + i
      if (!g.ins[id]) continue
      const x = g.gx0 + i * g.c
      const z = g.gz0 + j * g.c
      const arm = (ii: number, jj: number, ax: 0 | 1, dir: number) => {
        const k = jj * NX + ii
        return g.ins[k] ? { h: g.c, k } : { h: ray(x, z, ax, dir), k: -1 }
      }
      const [E, W, N, S] = [arm(i + 1, j, 0, 1), arm(i - 1, j, 0, -1), arm(i, j + 1, 1, 1), arm(i, j - 1, 1, -1)]
      const a = [2 / (E.h * (E.h + W.h)), 2 / (W.h * (E.h + W.h)), 2 / (N.h * (N.h + S.h)), 2 / (S.h * (N.h + S.h))]
      eqs.push({ id, a, k: [E.k, W.k, N.k, S.k], sum: a[0] + a[1] + a[2] + a[3] })
    }
  }
  const om = 2 / (1 + Math.sin(Math.PI / Math.max(g.nx, g.nz)))
  for (let it = 0; it < SOR_SWEEPS; it++) {
    let md = 0
    let mx = 1e-12
    for (const q of eqs) {
      let s = 1
      for (let r = 0; r < 4; r++) if (q.k[r] >= 0) s += q.a[r] * phi[q.k[r]]
      const dv = s / q.sum - phi[q.id]
      phi[q.id] += om * dv
      md = Math.max(md, Math.abs(dv))
      mx = Math.max(mx, phi[q.id])
    }
    if (md < 2e-5 * mx) break
  }
  const max = eqs.reduce((m, q) => Math.max(m, phi[q.id]), 0)
  return { phi, max: max || 1 }
}

/** The outline's interval on the line through (x, z) along an axis (0: x, 1: z) that holds the point (legacy roofChord). */
function chord(P: readonly P2[], along: 0 | 1, x: number, z: number, span: number): P2 | null {
  const pos = along ? z : x
  const q0 = along ? x : z
  const tol = 1e-6 * span + 1e-9
  for (const dq of [0, 1e-5, -1e-5, 1e-3, -1e-3]) {
    const q = q0 + dq * span
    const hits: number[] = []
    P.forEach((a, i) => {
      const b = P[(i + 1) % P.length]
      const qa = along ? a[0] : a[1]
      const qb = along ? b[0] : b[1]
      if (qa <= q !== qb <= q) {
        const pa = along ? a[1] : a[0]
        const pb = along ? b[1] : b[0]
        hits.push(pa + ((q - qa) / (qb - qa)) * (pb - pa))
      }
    })
    hits.sort((u, v) => u - v)
    for (let k = 0; k + 1 < hits.length; k += 2) if (pos >= hits[k] - tol && pos <= hits[k + 1] + tol) return [hits[k], hits[k + 1]]
  }
  return null
}

/** A circular arc of half-span b and rise r at u² (−1…1 squared), or half an ellipse when it rises more than it spans. */
function arc(u2: number, b: number, r: number): number {
  if (r <= 1e-6 || b <= 1e-9) return 0
  if (r <= b) {
    const R = (b * b + r * r) / (2 * r)
    return Math.max(0, Math.sqrt(Math.max(0, R * R - u2 * b * b)) - (R - r))
  }
  return r * Math.sqrt(Math.max(0, 1 - u2))
}

interface PointHeight {
  readonly h: number
  readonly th: number
  readonly f: P2
}

/** Soffit height, slab thickness and linework fields at a point of a vault, shell or saddle. */
function shapeFunction(P: readonly P2[], type: SculptedType, o: { pitch: number; ridge: 'x' | 'z'; curl: number; th0: number; thOpt?: number; span: number; H0: number; Hl: number; bbox: readonly number[] }): (x: number, z: number) => PointHeight {
  const [x0, x1, z0, z1] = o.bbox
  const sx = x1 - x0
  const sz = z1 - z0
  const pw = 1.4 + 1.6 * o.curl
  return (x, z) => {
    if (type === 'vault') {
      const along = o.ridge === 'x' ? 1 : 0
      const ch = chord(P, along, x, z, o.span)
      const pos = along ? z : x
      if (!ch) return { h: 0, th: o.th0, f: [along ? x : z, 1] }
      const mid = (ch[0] + ch[1]) / 2
      const half = (ch[1] - ch[0]) / 2 || 1e-6
      const t = clamp((pos - mid) / half, -1, 1)
      return { h: arc(t * t, half, o.pitch * half), th: o.th0, f: [along ? x : z, t] }
    }
    if (type === 'shell') {
      const sa = o.ridge === 'x' ? 1 : 0
      const cs = chord(P, sa, x, z, o.span)
      const ca = chord(P, sa ? 0 : 1, x, z, o.span)
      const ps = sa ? z : x
      const pa = sa ? x : z
      const s = cs ? clamp((ps - cs[0]) / (cs[1] - cs[0] || 1e-6), 0, 1) : 0
      const t = ca ? clamp((pa - (ca[0] + ca[1]) / 2) / ((ca[1] - ca[0]) / 2 || 1e-6), -1, 1) : 1
      const g = 0.04 + 0.96 * Math.pow(s, pw)
      const a = 0.06 + 0.94 * Math.pow(Math.max(0, 1 - t * t), 0.6)
      return { h: o.Hl * g * a, th: o.thOpt ?? o.th0 * (1 - 0.5 * s), f: [s, t] }
    }
    if (type === 'saddle') {
      const u = (x - (x0 + x1) / 2) / (sx / 2 || 1)
      const v = (z - (z0 + z1) / 2) / (sz / 2 || 1)
      return { h: (o.H0 * (1 + (o.ridge === 'z' ? -1 : 1) * u * v)) / 2, th: o.th0, f: [x, z] }
    }
    return { h: 0, th: o.th0, f: [0, 0] }
  }
}

/** The roof's height field over an outline in metres (legacy roofSurface). */
export function roofSurface(outline: readonly P2[], type: SculptedType, opt: SurfaceOptions = {}): RoofSurface {
  const P = clean(outline)
  const pitch = (opt.pitch ?? 6) / 12
  const ridge = opt.ridge === 'z' ? 'z' : 'x'
  const curl = clamp(opt.curl ?? 0.5, 0, 1)
  const xs = P.map((p) => p[0])
  const zs = P.map((p) => p[1])
  const bbox = P.length ? ([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] as const) : ([0, 0, 0, 0] as const)
  const [x0, x1, z0, z1] = bbox
  const sx = x1 - x0
  const sz = z1 - z0
  const span = Math.max(sx, sz, 1e-6)
  const S = Math.min(sx, sz) || span
  const c = span / (opt.res ?? RES)
  const H0 = (pitch * S) / 2
  const Hl = ((pitch * (ridge === 'x' ? sz : sx)) / 2) * (0.75 + 0.5 * curl)
  const th0 = opt.th ?? SLAB_M[type]
  const base = { type, P, bbox, span, S, c, H0, Hl, ridge } as const
  if (P.length < 3) return { ...base, V: [], T: [], H: [], TH: [], F: [], ring: [], at: () => ({ h: 0, th: th0, inside: false }) }

  const g = clippedGrid(P, x0, z0, sx, sz, c)
  const field = type === 'dome' || type === 'sod'
  const mem = field ? membrane(P, g) : null
  const fn = shapeFunction(P, type, { pitch, ridge, curl, th0, thOpt: opt.th, span, H0, Hl, bbox })
  const heights = g.V.map((p, i): PointHeight => {
    if (!mem) return fn(p[0], p[1])
    const k = g.node[i]
    const pn = k >= 0 && g.ins[k] ? mem.phi[k] / mem.max : 0
    const h = arc(1 - pn, S / 2, H0)
    return { h, th: th0, f: [H0 > 1e-9 ? h / H0 : pn, pn] }
  })
  const H = heights.map((q) => q.h)
  const TH = heights.map((q) => q.th)
  const F = heights.map((q) => q.f)

  // the outline, split where it crosses grid lines, with its heights
  const ring: RingPoint[] = []
  P.forEach((a, e) => {
    const b = P[(e + 1) % P.length]
    const ts = [0]
    for (const ax of [0, 1] as const) {
      const lo = Math.min(a[ax], b[ax])
      const hi = Math.max(a[ax], b[ax])
      const g0 = ax ? g.gz0 : g.gx0
      if (hi - lo < 1e-12) continue
      for (let k = Math.ceil((lo - g0) / c); k <= Math.floor((hi - g0) / c); k++) {
        const t = (g0 + k * c - a[ax]) / (b[ax] - a[ax])
        if (t > 1e-9 && t < 1 - 1e-9) ts.push(t)
      }
    }
    for (const t of ts.sort((u, v) => u - v)) {
      const x = a[0] + (b[0] - a[0]) * t
      const z = a[1] + (b[1] - a[1]) * t
      const r = field ? { h: 0, th: th0 } : fn(x, z)
      ring.push({ x, z, h: r.h, th: r.th })
    }
  })

  const at = (x: number, z: number): SurfaceSample => {
    const ci = Math.floor((x - g.gx0) / c)
    const cj = Math.floor((z - g.gz0) / c)
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di
        const j = cj + dj
        if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue
        for (const ti of g.cellT.get(j * g.nx + i) ?? []) {
          const [a, b, d] = g.T[ti]
          const [A, B, C] = [g.V[a], g.V[b], g.V[d]]
          const det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
          if (Math.abs(det) < 1e-14) continue
          const l1 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (z - C[1])) / det
          const l2 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (z - C[1])) / det
          const l3 = 1 - l1 - l2
          if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return { h: l1 * H[a] + l2 * H[b] + l3 * H[d], th: l1 * TH[a] + l2 * TH[b] + l3 * TH[d], inside: true }
        }
      }
    }
    if (!field) {
      const r = fn(x, z)
      return { h: r.h, th: r.th, inside: false }
    }
    return { h: 0, th: th0, inside: false }
  }

  return { ...base, V: g.V, T: g.T, H, TH, F, ring, at }
}

// ---------- linework ----------

export type RoofLineKind = 'edge' | 'rib' | 'contour' | 'crown' | 'seam' | 'mullion'

/** One family of lines: a field over the vertices and the levels drawn. */
export interface RoofLineSet {
  readonly val: (i: number) => number
  readonly levels: readonly number[]
  readonly kind: RoofLineKind
}

/** Line segments of one kind, as start/end pairs ready for a LineSegments geometry. */
export interface RoofLines {
  readonly kind: RoofLineKind
  readonly segments: readonly V3[]
}

/** Marching triangles over the top surface (legacy roofIsolines): segments where val crosses each level, lifted off the slab. */
export function roofIsolines(surf: RoofSurface, val: (i: number) => number, levels: readonly number[], lift: number): V3[] {
  const vv = surf.V.map((_, i) => val(i))
  const top = (i: number) => surf.H[i] + surf.TH[i]
  const cut = (p: number, q: number, fp: number, fq: number): V3 => {
    const t = fp / (fp - fq)
    return [surf.V[p][0] + (surf.V[q][0] - surf.V[p][0]) * t, top(p) + (top(q) - top(p)) * t + lift, surf.V[p][1] + (surf.V[q][1] - surf.V[p][1]) * t]
  }
  const out: V3[] = []
  for (const L of levels) {
    for (const [a, b, d] of surf.T) {
      const [fa, fb, fd] = [vv[a] - L, vv[b] - L, vv[d] - L]
      const [sa, sb, sd] = [fa >= 0, fb >= 0, fd >= 0]
      if (sa === sb && sb === sd) continue
      const pts: V3[] = []
      if (sa !== sb) pts.push(cut(a, b, fa, fb))
      if (sb !== sd) pts.push(cut(b, d, fb, fd))
      if (sd !== sa) pts.push(cut(d, a, fd, fa))
      if (pts.length === 2) out.push(pts[0], pts[1])
    }
  }
  return out
}

/** Evenly spaced levels strictly inside lo…hi, centred (legacy steps). */
function steps(lo: number, hi: number, d: number): number[] {
  if (!(d > 0)) return []
  const n = Math.floor((hi - lo) / d)
  const off = lo + (hi - lo - n * d) / 2
  return Array.from({ length: n + 1 }, (_, k) => off + k * d).filter((v) => v > lo + 1e-6 && v < hi - 1e-6)
}

/** Which linework a roof carries (legacy roofLineSets): mullions on glass, seams on metal and copper, else ribs, crowns and contours by type. */
export function roofLineSets(surf: RoofSurface, finish: RoofFinish | null, plan = false): RoofLineSet[] {
  const { V, F, type, S, ridge } = surf
  const [x0, x1, z0, z1] = surf.bbox
  const X = (i: number) => V[i][0]
  const Z = (i: number) => V[i][1]
  const across = (n: number) => Array.from({ length: n - 1 }, (_, k) => -1 + (2 * (k + 1)) / n)
  if (!plan && finish === 'glass') return [{ val: X, levels: steps(x0, x1, 1.2), kind: 'mullion' }, { val: Z, levels: steps(z0, z1, 1.2), kind: 'mullion' }]
  if (!plan && (finish === 'metal' || finish === 'copper')) {
    const d = finish === 'metal' ? 0.45 : 0.6
    if (type === 'vault') return [{ val: (i) => F[i][0], levels: ridge === 'x' ? steps(x0, x1, d) : steps(z0, z1, d), kind: 'seam' }]
    if (type === 'shell') return [{ val: (i) => F[i][1], levels: across(Math.max(6, Math.round(S / d))), kind: 'seam' }]
    return [{ val: X, levels: steps(x0, x1, d), kind: 'seam' }]
  }
  if (finish === 'sod' || type === 'sod') return plan ? [{ val: (i) => F[i][0], levels: [0.5], kind: 'contour' }] : []
  if (type === 'dome') return [{ val: (i) => F[i][0], levels: plan ? [0.25, 0.5, 0.75, 0.9] : [0.35, 0.62, 0.84], kind: 'contour' }]
  if (type === 'vault') {
    const [lo, hi] = ridge === 'x' ? [x0, x1] : [z0, z1]
    return [{ val: (i) => F[i][1], levels: [0], kind: 'crown' }, { val: (i) => F[i][0], levels: steps(lo, hi, Math.max(1.2, (hi - lo) / 8)), kind: 'rib' }]
  }
  if (type === 'shell') {
    const ribs: RoofLineSet = { val: (i) => F[i][1], levels: [-0.66, -0.33, 0, 0.33, 0.66], kind: 'rib' }
    return plan ? [ribs, { val: (i) => F[i][0], levels: [0.5, 0.85], kind: 'contour' }] : [ribs]
  }
  if (type === 'saddle') return [{ val: X, levels: steps(x0, x1, (x1 - x0) / 6), kind: 'rib' }, { val: Z, levels: steps(z0, z1, (z1 - z0) / 6), kind: 'rib' }]
  return []
}

/** Mullions on any glass roof mesh: where its faces cross x and z lines 1.2 m apart, lifted off the glass (legacy roofLineSets' glass family, for the classic roofs). */
export function glassMullions(mesh: MeshData, gap = 1.2): V3[] {
  const p = mesh.positions
  const n = mesh.normals
  if (!p.length) return []
  const xs = p.filter((_, i) => i % 3 === 0)
  const zs = p.filter((_, i) => i % 3 === 2)
  const families: readonly (readonly [0 | 2, readonly number[]])[] = [
    [0, steps(Math.min(...xs), Math.max(...xs), gap)],
    [2, steps(Math.min(...zs), Math.max(...zs), gap)],
  ]
  const out: V3[] = []
  for (let t = 0; t < p.length; t += 9) {
    const v = [0, 1, 2].map((k): V3 => [p[t + 3 * k], p[t + 3 * k + 1], p[t + 3 * k + 2]])
    const lift: V3 = [n[t] * LINE_LIFT_M, n[t + 1] * LINE_LIFT_M, n[t + 2] * LINE_LIFT_M]
    for (const [ax, levels] of families) {
      for (const L of levels) {
        const f = v.map((q) => q[ax] - L)
        const pts: V3[] = []
        for (let k = 0; k < 3; k++) {
          const a = k
          const b = (k + 1) % 3
          if (f[a] >= 0 === f[b] >= 0) continue
          const s = f[a] / (f[a] - f[b])
          pts.push([v[a][0] + (v[b][0] - v[a][0]) * s + lift[0], v[a][1] + (v[b][1] - v[a][1]) * s + lift[1], v[a][2] + (v[b][2] - v[a][2]) * s + lift[2]])
        }
        if (pts.length === 2) out.push(pts[0], pts[1])
      }
    }
  }
  return out
}

// ---------- sod tufts ----------

/** A tuft clump member: plan position (metres) and three random numbers that shape it. */
export type RoofTuft = readonly [x: number, z: number, r1: number, r2: number, r3: number]

function segDist(x: number, z: number, a: P2, b: P2): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l2 = dx * dx + dz * dz || 1
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1)
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz))
}

/** Clumps of meadow grass on a sod roof, seeded so they stay put (legacy roofTufts; shared with the plan stipple). */
export function roofTufts(surf: RoofSurface, seed: number): RoofTuft[] {
  const P = surf.P
  if (P.length < 3) return []
  const [x0, x1, z0, z1] = surf.bbox
  const rnd = seededRandom(seed)
  const nC = Math.round(Math.min(34, Math.max(5, Math.abs(signedAreaOf(P)) / 4)))
  const ok = (x: number, z: number) => pointInPolygon(P, x, z) && P.every((a, i) => segDist(x, z, a, P[(i + 1) % P.length]) >= TUFT_EDGE_M)
  const out: RoofTuft[] = []
  for (let k = 0, g = 0; k < nC && g < nC * 30; g++) {
    const cx = x0 + rnd() * (x1 - x0)
    const cz = z0 + rnd() * (z1 - z0)
    if (!ok(cx, cz)) continue
    k++
    const n = 3 + Math.floor(rnd() * 4)
    for (let q = 0; q < n; q++) {
      const r = 0.08 + rnd() * 0.38
      const a = rnd() * Math.PI * 2
      const x = cx + Math.cos(a) * r
      const z = cz + Math.sin(a) * r
      if (ok(x, z)) out.push([x, z, rnd(), rnd(), rnd()])
    }
  }
  return out
}

/** The legacy tuft seed: a hash of the roof outline in metres. */
export const tuftSeed = (outline: readonly P2[]): number => Math.round(outline.reduce((s, p) => s + p[0] * 7.13 + p[1] * 3.71, 0) * 100)

// ---------- the roof ----------

/** One grass cone or flower bud on a sod roof, mass-local metres, rotation as XYZ Euler angles. */
export interface TuftPlacement {
  readonly at: V3
  readonly rotation: V3
  readonly scale: V3
  readonly color: string
}

/** A sculpted roof, mass-local metres with y 0 at the wall top. */
export interface SculptedRoof {
  /** The top of the slab, smooth shaded. */
  readonly slab: MeshData
  /** Its underside, smooth shaded. */
  readonly soffit: MeshData
  /** The slab edge round the outline. */
  readonly fascia: MeshData
  /** Closes the gap between the wall tops and the soffit on enclosed masses. */
  readonly infill: MeshData
  /** Glass under vault, shell and saddle (and any glass roof), cladding under dome and sod. */
  readonly infillKind: 'glass' | 'clad'
  /** Slim struts from the wall top to the soffit on open porches. */
  readonly struts: MeshData
  readonly lines: readonly RoofLines[]
  readonly tufts: readonly TuftPlacement[]
  readonly blooms: readonly TuftPlacement[]
  /** Highest point of the slab above the wall top, metres. */
  readonly rise: number
  readonly finish: RoofFinish | null
}

export type SculptMass = Pick<Mass, 'roof' | 'pitch' | 'ridge' | 'overhang' | 'open' | 'curl' | 'roofMat'>

const toMetres = (P: readonly LocalPoint[]): P2[] => P.map(([x, z]) => [x * FT, z * FT] as const)

/** Outward normal (plan) of edge a→b of an outline wound with sign `s`. */
const outward = (a: P2, b: P2, s: number): V3 => [s * (b[1] - a[1]), 0, -s * (b[0] - a[0])]

/** Triangles over shared vertices with smooth (area-weighted) normals, expanded into a flat MeshData; UVs are plan feet. */
function smoothMesh(pts: readonly V3[], T: readonly Tri[], flip: boolean): MeshData {
  const acc = pts.map(() => [0, 0, 0])
  const tris = T.map(([a, b, d]): Tri => (flip ? [a, d, b] : [a, b, d]))
  for (const [a, b, d] of tris) {
    const [A, B, C] = [pts[a], pts[b], pts[d]]
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]]
    const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    for (const k of [a, b, d]) for (let q = 0; q < 3; q++) acc[k][q] += nrm[q]
  }
  const mesh = emptyMesh()
  for (const t of tris) {
    for (const k of t) {
      const l = Math.hypot(acc[k][0], acc[k][1], acc[k][2]) || 1
      mesh.positions.push(pts[k][0], pts[k][1], pts[k][2])
      mesh.normals.push(acc[k][0] / l, acc[k][1] / l, acc[k][2] / l)
      mesh.uvs.push(pts[k][0] / FT, pts[k][2] / FT)
    }
  }
  return mesh
}

/** A slim tapered round strut from y 0 to h at (x, z), smooth sided (legacy CylinderGeometry(0.045, 0.07, h, 8)). */
function addStrut(mesh: MeshData, x: number, z: number, h: number): void {
  for (let k = 0; k < STRUT_SIDES; k++) {
    const [a0, a1] = [(2 * Math.PI * k) / STRUT_SIDES, (2 * Math.PI * (k + 1)) / STRUT_SIDES]
    const ring = (a: number, r: number, y: number): readonly number[] => [x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(a), 0, Math.sin(a), (a * STRUT_FOOT_R) / FT, y / FT]
    const b0 = ring(a0, STRUT_FOOT_R, 0)
    const b1 = ring(a1, STRUT_FOOT_R, 0)
    const t0 = ring(a0, STRUT_TOP_R, h)
    const t1 = ring(a1, STRUT_TOP_R, h)
    for (const v of [b0, t0, b1, b1, t0, t1]) {
      mesh.positions.push(v[0], v[1], v[2])
      mesh.normals.push(v[3], v[4], v[5])
      mesh.uvs.push(v[6], v[7])
    }
  }
}

/** Strut feet: the corners of a few-sided porch, or points 2.4 m apart round a curved one, 0.3 m in from the edge. */
function strutPoints(walls: readonly P2[]): P2[] {
  const Pin = polyOffset(walls, -STRUT_INSET_M)
  if (Pin.length <= 8) return Pin
  const per = Pin.reduce((s, p, i) => s + Math.hypot(Pin[(i + 1) % Pin.length][0] - p[0], Pin[(i + 1) % Pin.length][1] - p[1]), 0)
  const n = Math.max(3, Math.round(per / STRUT_GAP_M))
  const out: P2[] = []
  let acc = 0
  let e = 0
  for (let k = 0; k < n; k++) {
    const want = (per * k) / n
    while (e < Pin.length) {
      const p = Pin[e]
      const q = Pin[(e + 1) % Pin.length]
      const L = Math.hypot(q[0] - p[0], q[1] - p[1])
      if (acc + L >= want) {
        const t = (want - acc) / (L || 1)
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
        break
      }
      acc += L
      e++
    }
  }
  return out
}

/** Wall-top infill (glass or cladding) up to the soffit along each wall, plus glass mullions (legacy sculptRoof's infill). */
function wallInfill(walls: readonly P2[], surf: RoofSurface, glassy: boolean): { mesh: MeshData; mullions: V3[] } {
  const mesh = emptyMesh()
  const mullions: V3[] = []
  const s = signedAreaOf(walls) >= 0 ? 1 : -1
  walls.forEach((a, e) => {
    const b = walls[(e + 1) % walls.length]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(1, Math.ceil(L / (surf.c * 0.8)))
    const out = outward(a, b, s)
    const pts = Array.from({ length: n + 1 }, (_, k): V3 => {
      const x = a[0] + ((b[0] - a[0]) * k) / n
      const z = a[1] + ((b[1] - a[1]) * k) / n
      return [x, surf.at(x, z).h, z]
    })
    for (let k = 1; k <= n; k++) {
      const [p, q] = [pts[k - 1], pts[k]]
      if (p[1] <= INFILL_MIN_M && q[1] <= INFILL_MIN_M) continue
      const quad: V3[] = [[p[0], 0, p[2]], [q[0], 0, q[2]]]
      if (q[1] > 1e-6) quad.push(q)
      if (p[1] > 1e-6) quad.push(p)
      addPolygon(mesh, quad, out)
    }
    if (!glassy) return
    const nm = Math.max(1, Math.round(L / MULLION_GAP_M))
    for (let k = 0; k < nm; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / nm
      const z = a[1] + ((b[1] - a[1]) * k) / nm
      const h = surf.at(x, z).h
      if (h > MULLION_MIN_M) mullions.push([x, 0, z], [x, h, z])
    }
  })
  return { mesh, mullions }
}

/** The slab edge round the outline, from the soffit up to the top. */
function fasciaBand(surf: RoofSurface): MeshData {
  const mesh = emptyMesh()
  const s = signedAreaOf(surf.P) >= 0 ? 1 : -1
  surf.ring.forEach((a, k) => {
    const b = surf.ring[(k + 1) % surf.ring.length]
    addPolygon(mesh, [[a.x, a.h + a.th, a.z], [b.x, b.h + b.th, b.z], [b.x, b.h, b.z], [a.x, a.h, a.z]], outward([a.x, a.z], [b.x, b.z], s))
  })
  return mesh
}

function tuftPlacements(surf: RoofSurface, seed: number): { tufts: TuftPlacement[]; blooms: TuftPlacement[] } {
  const tufts: TuftPlacement[] = []
  const blooms: TuftPlacement[] = []
  for (const [x, z, r1, r2, r3] of roofTufts(surf, seed)) {
    const s = surf.at(x, z)
    const sc = 0.6 + r2 * 0.9
    tufts.push({ at: [x, s.h + s.th - 0.02, z], rotation: [(r2 - 0.5) * 0.35, r1 * 6.28, (r3 - 0.5) * 0.35], scale: [sc * (0.8 + r3 * 0.5), sc, sc * (0.8 + r1 * 0.5)], color: GREENS[Math.floor(r3 * 4) % 4] })
    if (r3 < 0.22) blooms.push({ at: [x + (r1 - 0.5) * 0.2, s.h + s.th + 0.28 + r2 * 0.12, z + (r2 - 0.5) * 0.2], rotation: [0, 0, 0], scale: [1, 1, 1], color: BLOOMS[Math.floor(r1 * 4) % 4] })
  }
  return { tufts, blooms }
}

const emptyRoof = (finish: RoofFinish | null): SculptedRoof => ({ slab: emptyMesh(), soffit: emptyMesh(), fascia: emptyMesh(), infill: emptyMesh(), infillKind: 'clad', struts: emptyMesh(), lines: [], tufts: [], blooms: [], rise: 0, finish })

/** A sculpted roof's height field as sculptedRoof builds it: the outline grown by the overhang (metres), the finish and the slab thickness it sets; null when the roof is not sculpted. */
export interface SculptedSurface {
  readonly type: SculptedType
  readonly finish: RoofFinish | null
  readonly outline: readonly P2[]
  readonly surf: RoofSurface
}

export function sculptedSurface(poly: readonly LocalPoint[], m: SculptMass): SculptedSurface | null {
  if (!isSculpted(m.roof) || poly.length < 3) return null
  const type = m.roof
  const finish = roofFinishOf(m)
  const outline = toMetres(polyOffset(poly, Math.max(0, m.overhang)))
  const th = finishSlabM(type, finish)
  return { type, finish, outline, surf: roofSurface(outline, type, { pitch: m.pitch, ridge: m.ridge, curl: m.curl, th }) }
}

/**
 * A sculpted roof over a mass's walls (local feet), grown by its overhang
 * (legacy sculptRoof): the slab (top, soffit, fascia), infill or struts
 * under it, its linework and, on sod, the seeded grass tufts. The finish is
 * m.roofMat, or sod on a sod roof; pass the building's roofMat in m for a
 * main mass. `seed` overrides the tuft seed taken from the outline.
 */
export function sculptedRoof(poly: readonly LocalPoint[], m: SculptMass, seed?: number): SculptedRoof {
  const built = sculptedSurface(poly, m)
  if (!built) return emptyRoof(null)
  const { surf, finish, outline, type } = built
  const walls = clean(toMetres(poly))
  if (!surf.V.length) return emptyRoof(finish)
  const top = surf.V.map(([x, z], i): V3 => [x, surf.H[i] + surf.TH[i], z])
  const under = surf.V.map(([x, z], i): V3 => [x, surf.H[i], z])
  const glassy = finish === 'glass' || type === 'vault' || type === 'shell' || type === 'saddle'
  const fill = m.open ? { mesh: emptyMesh(), mullions: [] } : wallInfill(walls, surf, glassy)
  const struts = emptyMesh()
  if (m.open) {
    for (const [x, z] of strutPoints(walls)) {
      const h = surf.at(x, z).h
      if (h >= STRUT_MIN_M) addStrut(struts, x, z, h)
    }
  }
  const edges = surf.ring.flatMap((a, k): V3[] => {
    const b = surf.ring[(k + 1) % surf.ring.length]
    return [[a.x, a.h + a.th, a.z], [b.x, b.h + b.th, b.z], [a.x, a.h, a.z], [b.x, b.h, b.z]]
  })
  const sets = roofLineSets(surf, finish).map((s): RoofLines => ({ kind: s.kind, segments: roofIsolines(surf, s.val, s.levels, LINE_LIFT_M) }))
  const lines = [{ kind: 'edge' as const, segments: edges }, ...sets, { kind: 'mullion' as const, segments: fill.mullions }].filter((l) => l.segments.length)
  const grass = finish === 'sod' ? tuftPlacements(surf, seed ?? tuftSeed(outline)) : { tufts: [], blooms: [] }
  return {
    slab: smoothMesh(top, surf.T, false),
    soffit: smoothMesh(under, surf.T, true),
    fascia: fasciaBand(surf),
    infill: fill.mesh,
    infillKind: glassy ? 'glass' : 'clad',
    struts,
    lines,
    ...grass,
    rise: Math.max(0, ...top.map((p) => p[1]), ...surf.ring.map((r) => r.h + r.th)),
    finish,
  }
}
