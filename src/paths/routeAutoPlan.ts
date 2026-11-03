import type { Ground } from './pieces'
import { D2R, FT } from './routeSpec'

/**
 * The auto route's planning core (old ext:walk-auto): a leg as a polyline
 * of straight sub-legs, the switchback planner, and the run planner that
 * splits a leg into walks, level boardwalks, ramps with landings,
 * switchbacks and stairs from the ground along it.
 */

const IN = 0.0254
/** 5 ft landing (ADA 405.7.3). */
export const LAND = 5 * FT
/** 30 in max rise per ramp run (ADA 405.6). */
export const RISE_MAX = 30 * IN
/** Design rise per run, leaving room for rounding. */
export const RISE_K = RISE_MAX * 0.98
/** Design limit for walks, just under 1:20. */
export const WALK_MAX = 0.0495
/** Design: run ≥ 12.05 × rise, just under 1:12. */
export const RAMP_K = 12.05
const ZTOL = 0.013
export const GRID = 0.5 * FT
const RISER = 7 * IN
const TREAD = 11 * IN
/** Switchback corridor width. */
export const CORRIDOR = 12 * FT
const EPS = 1e-7

export interface PathSeg {
  readonly s0: number
  readonly s1: number
  readonly x0: number
  readonly n0: number
  readonly c: number
  readonly si: number
  readonly deg: number
}

export interface LegPath {
  readonly len: number
  readonly segs: readonly PathSeg[]
  /** Distances of the kinks. */
  readonly verts: readonly number[]
  readonly seg: (t: number) => PathSeg
  readonly pt: (t: number) => [number, number]
}

export function makePath(P: readonly [number, number], subs: readonly { deg: number; len: number }[]): LegPath {
  const segs: PathSeg[] = []
  let s = 0
  let x = P[0]
  let n = P[1]
  for (const sb of subs) {
    if (!(sb.len > 1e-9)) continue
    const c = Math.cos(sb.deg * D2R)
    const si = Math.sin(sb.deg * D2R)
    segs.push({ s0: s, s1: s + sb.len, x0: x, n0: n, c, si, deg: sb.deg })
    s += sb.len
    x += c * sb.len
    n += si * sb.len
  }
  const seg = (t: number) => segs.find((g) => t <= g.s1 + 1e-9) ?? segs[segs.length - 1]
  const pt = (t: number): [number, number] => {
    const g = seg(t)
    const d = t - g.s0
    return [g.x0 + g.c * d, g.n0 + g.si * d]
  }
  return { len: s, segs, verts: segs.slice(1).map((g) => g.s0), seg, pt }
}

export interface SwitchPlan {
  readonly K: number
  readonly phi: number
  readonly c: number
  readonly wsb: number
  readonly land: number
  readonly slope: number
  readonly sin: number
  readonly cot: number
}

/**
 * A zig-zag of 1:12 runs across the slope inside a 12 ft corridor, with a
 * level landing of 5 ft or more at the bottom, top and every turn. D: axial
 * length available, R: signed rise, Wm: route width, metres.
 */
export function switchPlan(D: number, R: number, Wm: number): SwitchPlan | null {
  const wsb = Math.max(36 * IN, Math.min(Wm || 4 * FT, 4 * FT))
  const c = (CORRIDOR - wsb) / 2
  const aR = Math.abs(R)
  for (let K = 2; K <= 80; K++) {
    const T = 2 * c * (K - 1)
    const A = D - (K + 1) * LAND
    if (A < -1e-9) return null
    const phiEx = Math.atan2(T, Math.max(0, A)) / D2R
    const phi = Math.max(1, Math.min(90, Math.ceil(phiEx - 1e-9)))
    const sn = Math.sin(phi * D2R)
    const cot = phi >= 90 ? 0 : Math.cos(phi * D2R) / sn
    const laneAx = T * cot
    if (laneAx > A + 1e-9) continue
    const slope = aR / (T / sn)
    if (slope * RAMP_K > 1 + 1e-12) continue
    const maxLat = K > 2 ? 2 * c : c
    if ((slope * maxLat) / sn > RISE_MAX - 1e-6) continue
    return { K, phi, c, wsb, land: (D - laneAx) / (K + 1), slope, sin: sn, cot }
  }
  return null
}

/** A sloped group must be straight; one kink near an end becomes its own turn landing of 5 ft or more. */
export function trimKink(path: LegPath, s0: number, s1: number): { s0: number; s1: number; lead?: boolean; tail?: boolean } | null {
  const v = path.verts.filter((x) => x > s0 + 1e-6 && x < s1 - 1e-6)
  if (!v.length) return { s0, s1 }
  if (v.length > 1) return null
  const k = v[0]
  if (k - s0 <= s1 - k) return k - s0 >= LAND - 1e-9 ? { s0: k, s1, lead: true } : null
  return s1 - k >= LAND - 1e-9 ? { s0, s1: k, tail: true } : null
}

export type RunType = 'walk' | 'board' | 'ramp' | 'switch' | 'stair'

export interface Interval {
  readonly type: RunType
  readonly s0: number
  readonly s1: number
  readonly z0: number
  readonly z1: number
}

export interface RunPlan {
  readonly iv: readonly Interval[]
  readonly warn: readonly string[]
  readonly zAt: (s: number) => number
}

export interface RunOptions {
  readonly ground: Ground
  readonly prefer: 'ramp' | 'stair'
  /** Route width, metres. */
  readonly W: number
}

type Span = { s0: number; s1: number; next: number }

/** Steep stretches of the ground along the leg (over 1:20, over a 1.5 m window), merged and on the 0.5 ft grid. */
function steepRuns(path: LegPath, g: readonly number[], h: number, forceS: boolean, forceE: boolean): { s0: number; s1: number }[] {
  const L = path.len
  const n = g.length - 1
  const m = Math.max(1, Math.round(0.75 / h))
  const flag = g.map((_, i) => {
    const a = Math.max(0, i - m)
    const b = Math.min(n, i + m)
    return Math.abs((g[b] - g[a]) / ((b - a) * h)) > WALK_MAX
  })
  const runs: { s0: number; s1: number }[] = []
  let st = -1
  for (let i = 0; i <= n + 1; i++) {
    const f = i <= n && flag[i]
    if (f && st < 0) st = i
    if (!f && st >= 0) {
      runs.push({ s0: Math.max(0, (st - 0.5) * h), s1: Math.min(L, (i - 0.5) * h) })
      st = -1
    }
  }
  if (forceS) runs.unshift({ s0: 0, s1: Math.min(L, 0.3) })
  if (forceE) runs.push({ s0: Math.max(0, L - 0.3), s1: L })
  const snapped = runs
    .sort((p, q) => p.s0 - q.s0)
    .map((r) => {
      const s1 = Math.min(L, Math.ceil(r.s1 / GRID - 1e-9) * GRID)
      return { s0: Math.max(0, Math.floor(r.s0 / GRID + 1e-9) * GRID), s1: L - s1 < GRID * 0.5 ? L : s1 }
    })
  return snapped.reduce<{ s0: number; s1: number }[]>((out, r) => {
    const last = out[out.length - 1]
    return last && r.s0 - last.s1 < 2.0 ? [...out.slice(0, -1), { s0: last.s0, s1: Math.max(last.s1, r.s1) }] : [...out, r]
  }, [])
}

/** Split a leg from level zS to zE into walks, level boardwalks, ramps, switchbacks and stairs. */
export function planRuns(path: LegPath, zS: number, zE: number, opt: RunOptions): RunPlan {
  const L = path.len
  const warn: string[] = []
  const N = Math.max(4, Math.ceil(L / 0.25))
  const h = L / N
  const g = Array.from({ length: N + 1 }, (_, i) => {
    const p = path.pt(i * h)
    return opt.ground(p[0], p[1])
  })
  const forceS = Math.abs(zS - g[0]) > ZTOL
  const forceE = Math.abs(zE - g[N]) > ZTOL
  const runs = steepRuns(path, g, h, forceS, forceE)
  const zAt = (s: number) => {
    if (s <= EPS) return zS
    if (s >= L - EPS) return zE
    const p = path.pt(s)
    return opt.ground(p[0], p[1])
  }
  const rampFeas = (c: Span) => {
    const t = trimKink(path, c.s0, c.s1)
    if (!t) return false
    const R = Math.abs(zAt(c.s1) - zAt(c.s0))
    const k = Math.max(1, Math.ceil(R / RISE_K))
    return R * RAMP_K + (k + 1) * LAND <= t.s1 - t.s0 + 1e-9
  }
  const stairFeas = (c: Span) => {
    const R = Math.abs(zAt(c.s1) - zAt(c.s0))
    return c.s1 - c.s0 >= Math.max(1, Math.ceil(R / RISER - 1e-9)) * TREAD - 1e-9
  }
  const switchFeas = (c: Span) => {
    const t = trimKink(path, c.s0, c.s1)
    return !!t && !!switchPlan(t.s1 - t.s0, zAt(c.s1) - zAt(c.s0), opt.W)
  }
  const out: Interval[] = []
  let lo = 0
  // grow a span both ways on the grid, swallowing nearby runs, until it fits
  const expand = (r: { s0: number; s1: number }, j: number, feas: (c: Span) => boolean): Span | null => {
    const c: Span = { s0: Math.max(r.s0, lo), s1: r.s1, next: j + 1 }
    for (let side = 0, guard = 0; guard < 4000; guard++) {
      if (c.s1 > c.s0 && feas(c)) return c
      const canL = c.s0 > lo + EPS
      const canR = c.s1 < L - EPS
      if (!canL && !canR) return null
      const goL = canL && (!canR || side % 2 === 0)
      side++
      if (goL) c.s0 = Math.max(lo, c.s0 - 2 * GRID)
      else {
        c.s1 = Math.min(L, c.s1 + 2 * GRID)
        if (L - c.s1 < GRID * 0.5) c.s1 = L
      }
      while (c.next < runs.length && runs[c.next].s0 - c.s1 < 2.0) c.s1 = Math.max(c.s1, runs[c.next++].s1)
    }
    return null
  }
  for (let idx = 0; idx < runs.length; ) {
    const r = { s0: Math.max(runs[idx].s0, lo), s1: runs[idx].s1 }
    if (r.s1 <= r.s0 + EPS) {
      idx++
      continue
    }
    const grade0 = Math.abs(zAt(r.s1) - zAt(r.s0)) / (r.s1 - r.s0)
    const forced = (r.s0 <= EPS && forceS) || (r.s1 >= L - EPS && forceE)
    const plain: Span = { ...r, next: idx + 1 }
    let c: Span | null
    let type: RunType
    if (!forced && grade0 <= WALK_MAX) {
      c = plain
      type = 'board'
    } else if (opt.prefer === 'stair' && grade0 * 12 > 1) {
      c = expand(r, idx, stairFeas) ?? plain
      type = 'stair'
    } else {
      c = expand(r, idx, rampFeas)
      type = 'ramp'
      if (!c) {
        c = expand(r, idx, switchFeas)
        type = 'switch'
      }
      if (!c) {
        c = expand(r, idx, stairFeas) ?? plain
        type = 'stair'
        warn.push(`Ground too steep for a 1:12 switchback inside a 12 ft corridor — stairs used (${(grade0 * 100).toFixed(1)} %).`)
      }
    }
    out.push({ type, s0: c.s0, s1: c.s1, z0: zAt(c.s0), z1: zAt(c.s1) })
    lo = c.s1
    idx = Math.max(idx + 1, c.next)
  }
  // walks fill the rest
  const iv: Interval[] = []
  let s = 0
  for (const b of out) {
    if (b.s0 > s + EPS) iv.push({ type: 'walk', s0: s, s1: b.s0, z0: zAt(s), z1: zAt(b.s0) })
    iv.push(b)
    s = b.s1
  }
  if (L > s + EPS) iv.push({ type: 'walk', s0: s, s1: L, z0: zAt(s), z1: zAt(L) })
  return { iv, warn, zAt }
}
