import type { LocalPoint } from './footprint'

/**
 * Curved outlines (legacy E1: crSpline, resampleCurve, fitBox, organicPoly,
 * ribbonSides, orgFit, orgScale, polyOffset). Every curve comes back in feet
 * about the mass centre (+z front), wound positive like every other
 * footprint, at about 1.5 ft chords (32 to 96 points), starting at the back
 * centre. Pure; results are cached by their inputs.
 */

type Pt = readonly [number, number]

export const ORGANIC_SHAPES = ['ellipse', 'kidney', 'teardrop', 'blob'] as const
export const DEFAULT_BEND = 0.35
export const DEFAULT_POINT = 0.5
const DENSE = 480
const CACHE_MAX = 500
const cache = new Map<string, unknown>()

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

function remember<T>(key: string, make: () => T): T {
  const hit = cache.get(key) as T | undefined
  if (hit) return hit
  const v = make()
  if (cache.size > CACHE_MAX) cache.clear()
  cache.set(key, v)
  return v
}

export function signedAreaOf(P: readonly Pt[]): number {
  let a = 0
  for (let i = 0; i < P.length; i++) {
    const p = P[i]
    const q = P[(i + 1) % P.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

/** Centripetal Catmull-Rom through pts (closed loop or open polyline), k samples per span. */
export function crSpline(pts: readonly Pt[], closed: boolean, k: number): Pt[] {
  const n = pts.length
  if (n < 2) return pts.map((p) => [p[0], p[1]] as const)
  if (!closed && n === 2) return [[pts[0][0], pts[0][1]], [pts[1][0], pts[1][1]]]
  const P: Pt[] = closed
    ? [...pts]
    : [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts, [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]]]
  const m = P.length
  const get = (i: number) => P[((i % m) + m) % m]
  const tj = (a: Pt, b: Pt) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])))
  const L = (A: Pt, B: Pt, ta: number, tb: number, t: number): Pt => {
    const f = (t - ta) / (tb - ta)
    return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]
  }
  const out: Pt[] = []
  for (let s = 0; s < (closed ? n : n - 1); s++) {
    const i = closed ? s : s + 1
    const [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)]
    const t1 = tj(p0, p1)
    const t2 = t1 + tj(p1, p2)
    const t3 = t2 + tj(p2, p3)
    for (let j = 0; j < k; j++) {
      const t = t1 + ((t2 - t1) * j) / k
      const A1 = L(p0, p1, 0, t1, t)
      const A2 = L(p1, p2, t1, t2, t)
      const A3 = L(p2, p3, t2, t3, t)
      out.push(L(L(A1, A2, 0, t2, t), L(A2, A3, t1, t3, t), t1, t2, t))
    }
  }
  if (!closed) out.push([pts[n - 1][0], pts[n - 1][1]])
  return out
}

export function curveLength(D: readonly Pt[], closed: boolean): number {
  let L = 0
  for (let i = 0; i < (closed ? D.length : D.length - 1); i++) {
    const a = D[i]
    const b = D[(i + 1) % D.length]
    L += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return L
}

/** N points evenly spaced by arc length, starting exactly at D[0]. */
export function resampleCurve(D: readonly Pt[], closed: boolean, N: number): Pt[] {
  const m = D.length
  const segs = closed ? m : m - 1
  const cum = [0]
  for (let i = 0; i < segs; i++) cum.push(cum[i] + Math.hypot(D[(i + 1) % m][0] - D[i][0], D[(i + 1) % m][1] - D[i][1]))
  const L = cum[segs]
  const out: Pt[] = []
  let s = 0
  for (let j = 0; j < N; j++) {
    const u = closed ? (L * j) / N : (L * j) / Math.max(1, N - 1)
    while (s < segs - 1 && cum[s + 1] < u) s++
    const a = D[s]
    const b = D[(s + 1) % m]
    const f = Math.max(0, Math.min(1, (u - cum[s]) / (cum[s + 1] - cum[s] || 1)))
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
  }
  return out
}

function fitBox(D: readonly Pt[], w: number, d: number): Pt[] {
  const xs = D.map((p) => p[0])
  const zs = D.map((p) => p[1])
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  const sx = w / (x1 - x0 || 1)
  const sz = d / (z1 - z0 || 1)
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  return D.map((p) => [(p[0] - cx) * sx, (p[1] - cz) * sz])
}

const orgSegs = (perim: number) => Math.max(32, Math.min(96, Math.round(perim / 1.5)))

/** The old planner's blob when none is drawn: seven control points over the box. */
export const blobDefault = (w: number, d: number): Pt[] =>
  ([[0, -0.5], [0.4, -0.42], [0.5, 0.05], [0.28, 0.47], [-0.12, 0.4], [-0.5, 0.22], [-0.4, -0.3]] as const).map(([x, z]) => [x * w, z * d])

/** Wind positive keeping the first point first (legacy D.reverse(); D.unshift(D.pop())). */
function positive(D: Pt[]): Pt[] {
  if (signedAreaOf(D) >= 0) return D
  const r = [...D].reverse()
  return [r[r.length - 1], ...r.slice(0, -1)]
}

export interface OrganicParams {
  readonly shape: string
  readonly w: number
  readonly d: number
  readonly bend?: number
  readonly point?: number
  readonly pts?: readonly (readonly number[])[]
}

const controlPts = (pts: readonly (readonly number[])[] | undefined, min: number): Pt[] | null =>
  Array.isArray(pts) && pts.length >= min ? pts.map((p) => [finite(p[0]), finite(p[1])] as const) : null

/** Ellipse, kidney, teardrop or blob outline (legacy organicPoly). */
export function organicOutline(m: OrganicParams): LocalPoint[] {
  const w = Math.max(0.5, finite(m.w) || 1)
  const d = Math.max(0.5, finite(m.d) || 1)
  const sh = m.shape
  const key = `${sh}|${w}|${d}|${m.bend ?? ''}|${m.point ?? ''}|${sh === 'blob' && m.pts ? JSON.stringify(m.pts) : ''}`
  const P = remember(key, () => {
    let D: Pt[] = []
    if (sh === 'teardrop') {
      const e = 0.5 + 0.85 * clamp01(m.point ?? DEFAULT_POINT)
      for (let j = 0; j < DENSE; j++) {
        const t = (2 * Math.PI * j) / DENSE
        D.push([-Math.sin(t) * Math.pow(Math.sin(t / 2), e), Math.cos(t)])
      }
    } else if (sh === 'blob') {
      D = crSpline(controlPts(m.pts, 3) ?? blobDefault(w, d), true, 32)
    } else {
      const bend = sh === 'kidney' ? clamp01(m.bend ?? DEFAULT_BEND) : 0
      for (let j = 0; j < DENSE; j++) {
        const t = -Math.PI / 2 + (2 * Math.PI * j) / DENSE
        const x = Math.cos(t)
        let z = Math.sin(t)
        // the bite on the back (−z) side
        if (bend && z < 0) z *= 1 - Math.min(1.15, bend * 1.5) * Math.exp(-Math.pow(x / 0.5, 2))
        D.push([bend ? x * (1 + 0.08 * bend * Math.max(0, -z)) : x, z])
      }
    }
    if (sh !== 'blob') D = fitBox(D, w, d)
    D = positive(D)
    let R = resampleCurve(D, true, orgSegs(curveLength(D, true)))
    if (sh === 'teardrop') {
      // start at the back centre like the ellipse and kidney
      let k = 0
      R.forEach((p, i) => {
        if (p[1] < R[k][1] - 1e-9 || (Math.abs(p[1] - R[k][1]) < 1e-9 && Math.abs(p[0]) < Math.abs(R[k][0]))) k = i
      })
      R = [...R.slice(k), ...R.slice(0, k)]
    }
    return R
  })
  return P.map((p) => [p[0], p[1]] as const)
}

export interface RibbonSides {
  /** Centreline, feet. */
  readonly C: readonly LocalPoint[]
  readonly L: readonly LocalPoint[]
  readonly R: readonly LocalPoint[]
}

/** A ribbon's centreline and its left and right edges, about 1 ft apart (legacy ribbonSides). */
export function ribbonSides(o: { w: number; d: number; pts?: readonly (readonly number[])[] }): RibbonSides {
  const key = `rib|${o.w}|${o.d}|${JSON.stringify(o.pts ?? null)}`
  return remember(key, () => {
    const C0 = controlPts(o.pts, 2) ?? ([[-0.5, 0], [-0.17, 0.12], [0.17, -0.12], [0.5, 0]] as const).map(([x, z]) => [x * o.w, z * o.w] as const)
    const D = crSpline(C0, false, 24)
    const C = resampleCurve(D, false, Math.max(8, Math.min(240, Math.round(curveLength(D, false)) + 1)))
    const hw = Math.max(0.5, finite(o.d) || 4) / 2
    const L: LocalPoint[] = []
    const R: LocalPoint[] = []
    C.forEach((p, i) => {
      const a = C[Math.max(0, i - 1)]
      const b = C[Math.min(C.length - 1, i + 1)]
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      const tx = (b[0] - a[0]) / l
      const tz = (b[1] - a[1]) / l
      L.push([p[0] + tz * hw, p[1] - tx * hw])
      R.push([p[0] - tz * hw, p[1] + tx * hw])
    })
    return { C, L, R }
  })
}

/** A ribbon as one closed outline, wound positive (legacy ribbonPoly). */
export function ribbonOutline(o: { w: number; d: number; pts?: readonly (readonly number[])[] }): LocalPoint[] {
  const s = ribbonSides(o)
  const P = [...s.L, ...[...s.R].reverse()]
  return signedAreaOf(P) < 0 ? P.reverse() : P
}

const r1 = (v: number) => Math.round(v * 10) / 10
const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * The width and depth a drawn shape implies (legacy orgFit): a blob's (or an
 * outline's) w/d are the box of its curve; a ribbon's w is its centreline
 * length. Null when nothing changes.
 */
export function organicFit(m: OrganicParams, outline: readonly LocalPoint[]): { w: number; d: number } | null {
  if ((m.shape === 'blob' || m.shape === 'poly') && controlPts(m.pts, 3)) {
    const xs = outline.map((p) => p[0])
    const zs = outline.map((p) => p[1])
    return { w: r1(Math.max(...xs) - Math.min(...xs)), d: r1(Math.max(...zs) - Math.min(...zs)) }
  }
  const C = m.shape === 'ribbon' ? controlPts(m.pts, 2) : null
  return C ? { w: r1(curveLength(crSpline(C, false, 24), false)), d: m.d } : null
}

/**
 * New control points when a blob's (or outline's) width or depth is typed,
 * scaled about the centre; a ribbon's width scales its centreline (legacy
 * orgScale). Null when the points don't change.
 */
export function organicScale(m: OrganicParams, nw: number, nd: number): number[][] | null {
  const pts = controlPts(m.pts, 2)
  if (!pts || !(m.w > 0)) return null
  if ((m.shape === 'blob' || m.shape === 'poly') && m.d > 0) {
    const sx = nw / m.w
    const sz = nd / m.d
    return sx === 1 && sz === 1 ? null : pts.map((p) => [r2(p[0] * sx), r2(p[1] * sz)])
  }
  if (m.shape === 'ribbon') {
    const k = nw / m.w
    return k === 1 ? null : pts.map((p) => [r2(p[0] * k), r2(p[1] * k)])
  }
  return null
}

/** Which extra field a shape's Taper/skew box edits (legacy shapeParamKey). */
export const shapeParamKey = (shape: string): 'skew' | 'bend' | 'point' | 'taper' =>
  shape === 'para' ? 'skew' : shape === 'kidney' ? 'bend' : shape === 'teardrop' ? 'point' : 'taper'

/** A true mitred offset for smooth many-point outlines (legacy polyOffset): k > 0 grows, k < 0 shrinks. */
export function polyOffset(P: readonly LocalPoint[], k: number): LocalPoint[] {
  const n = P.length
  const s = signedAreaOf(P) > 0 ? 1 : -1
  const N = P.map((a, i) => {
    const b = P[(i + 1) % n]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [(s * (b[1] - a[1])) / L, (-s * (b[0] - a[0])) / L] as const
  })
  return P.map((p, i) => {
    const n0 = N[(i + n - 1) % n]
    const n1 = N[i]
    let mx = n0[0] + n1[0]
    let mz = n0[1] + n1[1]
    const ml = Math.hypot(mx, mz)
    if (ml < 1e-6) return [p[0] + n1[0] * k, p[1] + n1[1] * k] as const
    mx /= ml
    mz /= ml
    const c = Math.max(0.5, mx * n1[0] + mz * n1[1])
    return [p[0] + (mx * k) / c, p[1] + (mz * k) / c] as const
  })
}

/** Control points → a smooth closed outline, wound positive, about segFt chords, starting at pts[0] (legacy smoothClosed). */
export function smoothClosed(pts: readonly (readonly number[])[], segFt = 1.25): LocalPoint[] {
  const D = positive(crSpline(pts.map((p) => [finite(p[0]), finite(p[1])] as const), true, 24))
  return resampleCurve(D, true, Math.max(32, Math.min(160, Math.round(curveLength(D, true) / segFt))))
}
