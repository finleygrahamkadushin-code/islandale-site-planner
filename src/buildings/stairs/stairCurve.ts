/**
 * The curve a stair or ramp top meets on its host, ported from the old
 * planner's stair-geom block. Stair frame, metres: x across the stair
 * (-w/2..w/2), z along the run from the top (-run/2) to the foot (+run/2).
 * A curve H is a list of [x, z] sorted by x over [-w/2, w/2], piecewise
 * linear.
 */
export type XZ = readonly [number, number]
export type Curve = readonly XZ[]

/** How far behind the nominal top line the top tread or plate may reach to close a gap against an angled host (legacy EXT). */
export const EXT_M = 1.5
const EPS = 1e-7

const same = (p: XZ, q: XZ) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9

/** Signed area of a polygon (positive counter-clockwise in x, z). */
export function area(P: readonly XZ[]): number {
  let a = 0
  P.forEach((p, i) => {
    const q = P[(i + 1) % P.length]
    a += p[0] * q[1] - q[0] * p[1]
  })
  return a / 2
}

/** Drop repeated points, including a closing point equal to the first. */
export function clean(P: readonly XZ[]): XZ[] {
  const out: XZ[] = []
  for (const p of P) if (!out.length || !same(out[out.length - 1], p)) out.push([p[0], p[1]])
  while (out.length > 1 && same(out[0], out[out.length - 1])) out.pop()
  return out
}

/** H at x, held flat past its ends. */
export function evalH(H: Curve, x: number): number {
  if (x <= H[0][0]) return H[0][1]
  const last = H[H.length - 1]
  if (x >= last[0]) return last[1]
  for (let i = 1; i < H.length; i++) {
    const a = H[i - 1]
    const b = H[i]
    if (x <= b[0]) return a[1] + (b[1] - a[1]) * (b[0] > a[0] ? (x - a[0]) / (b[0] - a[0]) : 0)
  }
  return last[1]
}

/** H with a point inserted wherever it crosses z = c. */
function withCross(H: Curve, c: number): XZ[] {
  const out: XZ[] = [H[0]]
  for (let i = 1; i < H.length; i++) {
    const a = H[i - 1]
    const b = H[i]
    if ((a[1] - c) * (b[1] - c) < 0) {
      const t = (c - a[1]) / (b[1] - a[1])
      out.push([a[0] + (b[0] - a[0]) * t, c])
    }
    out.push(b)
  }
  return out
}

/** The pointwise max of H and z = c. */
export const hMax = (H: Curve, c: number): XZ[] => withCross(H, c).map((p) => [p[0], Math.max(p[1], c)])
/** H held between lo and hi. */
export const hClamp = (H: Curve, lo: number, hi: number): XZ[] => withCross(withCross(H, lo), hi).map((p) => [p[0], Math.min(hi, Math.max(lo, p[1]))])
/** A straight line across the stair at z. */
export const hFlat = (w: number, z: number): XZ[] => [
  [-w / 2, z],
  [w / 2, z],
]
/** The furthest-down point of H. */
export const hTop = (H: Curve): number => H.reduce((m, p) => Math.max(m, p[1]), -Infinity)

/**
 * The polygons of the region H(x) <= z <= zHi: the lower boundary follows
 * H left to right and closes back along zHi; separate pieces where H
 * rises past zHi. Slivers are dropped.
 */
export function band(H: Curve, zHi: number): XZ[][] {
  const P = withCross(H, zHi)
  const polys: XZ[][] = []
  let run: XZ[] = []
  let prevB: XZ | null = null
  const flush = () => {
    if (run.length >= 2) {
      const poly = [...run]
      const xa = run[0][0]
      const xb = run[run.length - 1][0]
      if (Math.abs(run[run.length - 1][1] - zHi) > EPS) poly.push([xb, zHi])
      if (Math.abs(run[0][1] - zHi) > EPS) poly.push([xa, zHi])
      const c = clean(poly)
      if (c.length >= 3 && Math.abs(area(c)) > 1e-9) polys.push(c)
    }
    run = []
  }
  for (const p of P) {
    if (p[1] < zHi - EPS) {
      if (!run.length && prevB) run.push(prevB)
      run.push(p)
      prevB = null
    } else {
      if (run.length && Math.abs(p[1] - zHi) <= EPS) run.push(p)
      flush()
      prevB = Math.abs(p[1] - zHi) <= EPS ? p : null
    }
  }
  flush()
  return polys
}

/** Where a stair's top meets its host: a sampled curve, a straight line (extended), or none (straight at -run/2). */
export type TopEdge = { readonly pts: readonly XZ[] } | { readonly a: XZ; readonly b: XZ } | null

/** The top curve over [-w/2, w/2] (legacy hostCurve), extrapolated linearly past the given points. */
export function hostCurve(topEdge: TopEdge, w: number, run: number): XZ[] {
  const flat = hFlat(w, -run / 2)
  if (!topEdge) return flat
  const raw = 'pts' in topEdge ? topEdge.pts : [topEdge.a, topEdge.b]
  const pts = raw.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).sort((p, q) => p[0] - q[0])
  const U: XZ[] = []
  for (const p of pts) if (!U.length || p[0] - U[U.length - 1][0] > 1e-6) U.push(p)
  if (U.length < 2) return flat
  const f = (x: number) => {
    let i = 1
    while (i < U.length - 1 && x > U[i][0]) i++
    const a = U[i - 1]
    const b = U[i]
    return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])
  }
  const H: XZ[] = [[-w / 2, f(-w / 2)], ...U.filter((p) => p[0] > -w / 2 + 1e-6 && p[0] < w / 2 - 1e-6), [w / 2, f(w / 2)]]
  return H.every((p) => Number.isFinite(p[1])) ? H : flat
}

/**
 * Legacy boundaryPts: sample the host outline (in the stair frame) across
 * the stair's width, keeping at each x the crossing nearest the nominal
 * top line, within EXT behind it and no further than the foot. A curved
 * host (more than 24 vertices) is sampled at 9 points, a straight one at
 * its two sides, plus every host vertex inside the width near the top.
 */
export function boundaryPts(Pst: readonly XZ[], w: number, run: number): XZ[] | null {
  if (Pst.length < 3) return null
  const N = Pst.length > 24 ? 9 : 2
  const xs: number[] = []
  for (let k = 0; k < N; k++) xs.push(-w / 2 + (w * k) / (N - 1))
  for (const p of Pst) if (p[0] > -w / 2 + 1e-6 && p[0] < w / 2 - 1e-6 && Math.abs(p[1] + run / 2) < EXT_M) xs.push(p[0])
  const out: XZ[] = []
  for (const x of xs.sort((a, b) => a - b)) {
    let best: number | null = null
    Pst.forEach((a, i) => {
      const b = Pst[(i + 1) % Pst.length]
      if (Math.abs(b[0] - a[0]) < 1e-9 || (x - a[0]) * (x - b[0]) > 1e-12) return
      const z = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])
      if (z < -run / 2 - EXT_M || z > run / 2) return
      if (best === null || Math.abs(z + run / 2) < Math.abs(best + run / 2)) best = z
    })
    if (best !== null) out.push([x, best])
  }
  return out.length >= 2 ? out : null
}
