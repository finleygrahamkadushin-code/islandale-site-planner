import type { SitePoint } from '../types'
import type { WallMaterial } from './earthworksSpec'

/**
 * Retaining walls along a building's cut (legacy earthRetaining): marching
 * squares on the cut-edge distance, chained into polylines, then kept only
 * where the bank above is deep and the ground below has been cut down.
 */

/** Wall thickness, metres; the wall stands on the outside of the cut edge. */
export const WALL_THICKNESS_M = 0.5
/** A wall is drawn where the bank stands more than this above the cut floor, metres. */
export const WALL_MIN_RETAIN_M = 0.32
/** The wall's foot goes this far under the cut floor; its cap stands this far over the bank, metres. */
const FOOT_M = 0.15
const CAP_M = 0.12
/** The ground just inside the wall must be within this of the cut floor, metres. */
const INNER_TOL_M = 0.15
const INNER_PROBE_M = 0.25
const SIDE_PROBE_M = 0.15

/** One run of retaining wall, site metres and NAVD88 metres. */
export interface RetainingWall {
  /** The building whose cut it holds back. */
  readonly id: string
  readonly material: WallMaterial
  /** The inner face along the cut edge. */
  readonly pts: readonly SitePoint[]
  /** The outer face, a wall thickness out (into the bank). */
  readonly outer: readonly SitePoint[]
  /** Cap elevation at each point. */
  readonly tops: readonly number[]
  /** Foot elevation, under the cut floor. */
  readonly foot: number
  /** The cut floor in front of it. */
  readonly floor: number
}

/** Signed distance to the cut edge on a block of raster samples (negative in the cut). */
export interface CutEdgeGrid {
  readonly x0: number
  readonly n0: number
  readonly h: number
  readonly I0: number
  readonly I1: number
  readonly J0: number
  readonly J1: number
  /** Samples per row of `sd`. */
  readonly rw: number
  readonly sd: Float32Array
}

/** The cut edge (sd = 0) as polylines, marching squares then chaining shared crossings. */
export function cutEdgeLines(g: CutEdgeGrid): SitePoint[][] {
  const v = (I: number, J: number) => g.sd[(J - g.J0) * g.rw + (I - g.I0)]
  const at = (I: number, J: number): SitePoint => [g.x0 + I * g.h, g.n0 + J * g.h]
  const pts = new Map<number, SitePoint>()
  const stride = g.I1 + 2
  // one key per grid edge: horizontal edges even, vertical edges odd
  const cross = (key: number, Ia: number, Ja: number, Ib: number, Jb: number): number => {
    if (!pts.has(key)) {
      const a = v(Ia, Ja)
      const b = v(Ib, Jb)
      const t = a / (a - b)
      const pa = at(Ia, Ja)
      const pb = at(Ib, Jb)
      pts.set(key, [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t])
    }
    return key
  }
  const hKey = (I: number, J: number) => (J * stride + I) * 2
  const vKey = (I: number, J: number) => (J * stride + I) * 2 + 1
  const segs: [number, number][] = []
  for (let J = g.J0; J < g.J1; J++) {
    for (let I = g.I0; I < g.I1; I++) {
      const ins = [v(I, J) <= 0, v(I + 1, J) <= 0, v(I + 1, J + 1) <= 0, v(I, J + 1) <= 0]
      const e: number[] = []
      if (ins[0] !== ins[1]) e.push(cross(hKey(I, J), I, J, I + 1, J))
      if (ins[1] !== ins[2]) e.push(cross(vKey(I + 1, J), I + 1, J, I + 1, J + 1))
      if (ins[2] !== ins[3]) e.push(cross(hKey(I, J + 1), I, J + 1, I + 1, J + 1))
      if (ins[3] !== ins[0]) e.push(cross(vKey(I, J), I, J, I, J + 1))
      for (let q = 0; q + 1 < e.length; q += 2) segs.push([e[q], e[q + 1]])
    }
  }
  const adj = new Map<number, number[]>()
  segs.forEach(([a, b], i) => {
    adj.set(a, [...(adj.get(a) ?? []), i])
    adj.set(b, [...(adj.get(b) ?? []), i])
  })
  const used = new Uint8Array(segs.length)
  const lines: SitePoint[][] = []
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue
    used[s0] = 1
    const line = [segs[s0][0], segs[s0][1]]
    for (const forward of [true, false]) {
      for (;;) {
        const end = forward ? line[line.length - 1] : line[0]
        const next = (adj.get(end) ?? []).find((i) => !used[i])
        if (next === undefined) break
        used[next] = 1
        const other = segs[next][0] === end ? segs[next][1] : segs[next][0]
        if (forward) line.push(other)
        else line.unshift(other)
      }
    }
    lines.push(line.map((k) => pts.get(k) as SitePoint))
  }
  return lines
}

/** The cut-edge distance at any point of the grid, bilinear. */
function sdAt(g: CutEdgeGrid, x: number, n: number): number {
  const fx = Math.max(g.I0, Math.min(g.I1 - 1e-3, (x - g.x0) / g.h))
  const fy = Math.max(g.J0, Math.min(g.J1 - 1e-3, (n - g.n0) / g.h))
  const I = Math.floor(fx)
  const J = Math.floor(fy)
  const tx = fx - I
  const ty = fy - J
  const v = (i: number, j: number) => g.sd[(j - g.J0) * g.rw + (i - g.I0)]
  return (v(I, J) * (1 - tx) + v(I + 1, J) * tx) * (1 - ty) + (v(I, J + 1) * (1 - tx) + v(I + 1, J + 1) * tx) * ty
}

/** Unit normals along a polyline, turned to point out of the cut (toward larger distance). */
function outwardNormals(g: CutEdgeGrid, L: readonly SitePoint[]): SitePoint[] {
  const last = L.length - 1
  const closed = Math.hypot(L[0][0] - L[last][0], L[0][1] - L[last][1]) < 1e-6
  const nrm = L.map((_, i): SitePoint => {
    let a = L[Math.max(0, i - 1)]
    let b = L[Math.min(last, i + 1)]
    if (closed && (i === 0 || i === last)) {
      a = L[last - 1]
      b = L[1]
    }
    const tx = b[0] - a[0]
    const tn = b[1] - a[1]
    const l = Math.hypot(tx, tn) || 1
    return [tn / l, -tx / l]
  })
  const mid = Math.floor(L.length / 2)
  const [p, nn] = [L[mid], nrm[mid]]
  const out = sdAt(g, p[0] + nn[0] * SIDE_PROBE_M, p[1] + nn[1] * SIDE_PROBE_M) > sdAt(g, p[0] - nn[0] * SIDE_PROBE_M, p[1] - nn[1] * SIDE_PROBE_M)
  return out ? nrm : nrm.map(([x, n]) => [-x, -n])
}

/**
 * Retaining walls for one building's cut: along the cut edge wherever the
 * bank stands more than 0.32 m over the cut floor and the ground in front
 * has been cut down to it. `ground` is the finished ground.
 */
export function retainingWalls(
  g: CutEdgeGrid,
  floor: number,
  material: WallMaterial,
  id: string,
  ground: (x: number, n: number) => number,
): RetainingWall[] {
  const T = WALL_THICKNESS_M
  const walls: RetainingWall[] = []
  for (const L0 of cutEdgeLines(g)) {
    // every other crossing is plenty for a wall, keeping both ends
    const L = L0.filter((_, i) => i === 0 || i === L0.length - 1 || i % 2 === 0)
    if (L.length < 2) continue
    const nrm = outwardNormals(g, L)
    const tops = L.map(([x, n], i) => {
      const [ux, un] = nrm[i]
      return Math.max(ground(x + ux * (T + 0.25), n + un * (T + 0.25)), ground(x + ux * T * 0.6, n + un * T * 0.6)) + CAP_M
    })
    const ok = L.map(([x, n], i) => tops[i] - floor > WALL_MIN_RETAIN_M && ground(x - nrm[i][0] * INNER_PROBE_M, n - nrm[i][1] * INNER_PROBE_M) < floor + INNER_TOL_M)
    const runs: number[][] = []
    let run: number[] | null = null
    ok.forEach((good, i) => {
      if (!good) run = null
      else if (run) run.push(i)
      else runs.push((run = [i]))
    })
    for (const R of runs) {
      if (R.length < 2) continue
      walls.push({
        id,
        material,
        pts: R.map((i) => L[i]),
        outer: R.map((i): SitePoint => [L[i][0] + nrm[i][0] * T, L[i][1] + nrm[i][1] * T]),
        tops: R.map((i) => tops[i]),
        foot: floor - FOOT_M,
        floor,
      })
    }
  }
  return walls
}
