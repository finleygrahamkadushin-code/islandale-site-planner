/**
 * Where a guard rail opens, ported from the old planner's join-rails and
 * rail-clear blocks. Everything here is site metres (x east, n north) and
 * an opening is an interval [u0, u1] in metres along one edge, measured
 * from its first vertex. Pure: the scene glue (railSite.ts) gathers the
 * edges, landings, doors and walls.
 */

export type P2 = readonly [number, number]
export type Interval = readonly [number, number]

/** Rail stubs this short or shorter are not drawn (legacy MIN_RUN). */
export const MIN_RUN_M = 0.15

/** join-core / join-rails: what lands on an edge. */
export const JOIN = {
  /** An end this close to an edge line lands on it. */
  tol: 0.35,
  /** Slack past the edge ends. */
  ext: 0.05,
  /** Parallel within 10° (sine), for deck edges that abut. */
  par: Math.sin((10 * Math.PI) / 180),
  /** Added each side of a walking-surface landing. */
  pad: 0.05,
  /** A landing more than this above or below the edge passes by. */
  dzMax: 0.3,
} as const

/** rail-clear: clearances for stairs, paths, bridges and doors. */
export const CLEAR = {
  tol: 0.5,
  ext: 0.05,
  dzMax: 1.0,
  doorPad: 0.15,
  doorDepth: 0.9,
  doorBack: 0.5,
  stairIn: 0.05,
  stairBack: 0.6,
  stairFwd: 0.3,
  postPad: 0.3,
  clearLat: 0.3,
  clearLon: 0.6,
} as const

/** Enclosed walls this close to a rail edge, and parallel to it, open it. */
export const WALL_TOL_M = 0.45
const WALL_COS = 0.985

/** A stair or ramp wing's top: centre of its top edge, unit axis from top to foot, width (m). */
export interface StairTop {
  readonly c: P2
  readonly axis: P2
  readonly w: number
}

/** A rail edge: its ends and walking-surface elevation. */
export interface RailEdge {
  readonly a: P2
  readonly b: P2
  readonly z: number
}

/** An edge of the building something can land on: a free deck or porch edge, or a wall with doors (`doors` set). */
export interface HostEdge extends RailEdge {
  readonly mi: number
  readonly i: number
  /** A wall edge only takes landings that meet one of these door spans (m along the edge). */
  readonly doors?: readonly Interval[]
}

/** Something that can land on a host edge (join-core candidates). */
export type Landing =
  | { readonly kind: 'stair-wing' | 'ramp-wing'; readonly at: P2; readonly z: number; readonly w: number; readonly top: StairTop }
  | { readonly kind: 'piece' | 'bridge'; readonly at: P2; readonly z: number; readonly w: number }
  | { readonly kind: 'deck-abut'; readonly a: P2; readonly b: P2; readonly z: number }

/** Things a rail keeps clear of (rail-clear items). */
export type ClearItem =
  | { readonly type: 'wing'; readonly kind: 'stair' | 'ramp'; readonly top: StairTop; readonly z: number; readonly name: string }
  | { readonly type: 'piece' | 'bridge'; readonly at: P2; readonly z: number; readonly w: number; readonly name: string }
  | { readonly type: 'door'; readonly a: P2; readonly b: P2; readonly nrm: P2; readonly z: number; readonly name: string }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface Frame {
  readonly L: number
  readonly ux: number
  readonly un: number
}
const frame = (a: P2, b: P2): Frame => {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  return { L, ux: L ? (b[0] - a[0]) / L : 1, un: L ? (b[1] - a[1]) / L : 0 }
}
/** u along the edge from a, and d to its left. */
const project = (a: P2, F: Frame, [x, n]: P2) => {
  const px = x - a[0]
  const pn = n - a[1]
  return { u: px * F.ux + pn * F.un, d: -px * F.un + pn * F.ux }
}

/** Overlapping or touching intervals joined, in order. */
export function mergeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = list.filter((r) => Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] > r[0]).sort((p, q) => p[0] - q[0])
  const out: [number, number][] = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last && a <= last[1] + 1e-9) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/** The rail runs left on an edge of length L once the openings are taken out; runs of `min` or less are dropped (legacy railKeepSegs). */
export function keepRuns(openings: readonly Interval[], L: number, min = MIN_RUN_M): Interval[] {
  const out: Interval[] = []
  let s = 0
  for (const [a, b] of mergeIntervals(openings)) {
    if (a - s > min) out.push([s, a])
    s = Math.max(s, b)
  }
  if (L - s > min) out.push([s, L])
  return out
}

/**
 * Runs along an edge of length L sampled every 8 cm or so, a sample dropped
 * where `blocked(u)` (legacy raisedRail, used for porches); runs longer
 * than MIN_RUN are kept.
 */
export function sampledRuns(L: number, blocked: (u: number) => boolean): Interval[] {
  const n = Math.max(2, Math.ceil(L / 0.08))
  const out: Interval[] = []
  let k0: number | null = null
  for (let k = 0; k <= n + 1; k++) {
    const on = k <= n && !blocked((L * k) / n)
    if (on && k0 === null) k0 = k
    if (!on && k0 !== null) {
      const u0 = (L * k0) / n
      const u1 = (L * (k - 1)) / n
      if (u1 - u0 > MIN_RUN_M) out.push([u0, u1])
      k0 = null
    }
  }
  return out
}

/** Whether u falls inside one of the intervals. */
export const inIntervals = (list: readonly Interval[], u: number): boolean => list.some(([a, b]) => u >= a - 1e-9 && u <= b + 1e-9)

/**
 * Legacy clipToZone (Liang–Barsky): the part [t0, t1] of a→b inside the
 * zone s ∈ [s0, s1] along unit t and h ∈ [h0, h1] along unit nrm, both
 * measured from origin J; null when it misses.
 */
export function clipToZone(a: P2, b: P2, J: P2, t: P2, nrm: P2, s0: number, s1: number, h0: number, h1: number): Interval | null {
  let lo = 0
  let hi = 1
  const lim = (f0: number, f1: number, mn: number, mx: number) => {
    if (Math.abs(f1) < 1e-12) {
      if (f0 < mn - 1e-9 || f0 > mx + 1e-9) {
        lo = 1
        hi = 0
      }
      return
    }
    let ta = (mn - f0) / f1
    let tb = (mx - f0) / f1
    if (ta > tb) [ta, tb] = [tb, ta]
    lo = Math.max(lo, ta)
    hi = Math.min(hi, tb)
  }
  const ax = a[0] - J[0]
  const an = a[1] - J[1]
  const dx = b[0] - a[0]
  const dn = b[1] - a[1]
  lim(ax * t[0] + an * t[1], dx * t[0] + dn * t[1], s0, s1)
  lim(ax * nrm[0] + an * nrm[1], dx * nrm[0] + dn * nrm[1], h0, h1)
  return hi - lo > 1e-9 ? [lo, hi] : null
}

/** The two top corners of a stair (top centre ± half its width across the axis). */
export function stairTopCorners(top: StairTop): [P2, P2] {
  const hw = top.w / 2
  const px = -top.axis[1]
  const pn = top.axis[0]
  return [
    [top.c[0] - px * hw, top.c[1] - pn * hw],
    [top.c[0] + px * hw, top.c[1] + pn * hw],
  ]
}

/**
 * Legacy stairTopSpan: the span of edge a→b (m from a, clamped to [0, L])
 * that the stair's top covers. Each side of the stair runs along its axis
 * until it meets the edge line, so a stair set at an angle to its host edge
 * still opens exactly its own width; null when it misses the edge.
 */
export function stairTopSpan(edge: Pick<RailEdge, 'a' | 'b'>, top: StairTop): Interval | null {
  const F = frame(edge.a, edge.b)
  if (!(F.L > 1e-9)) return null
  const across = top.axis[0] * -F.un + top.axis[1] * F.ux
  const us = stairTopCorners(top).map((p) => {
    const q = project(edge.a, F, p)
    // slide along the axis onto the edge line; a stair running alongside the edge just projects
    if (Math.abs(across) < 1e-6) return q.u
    const t = -q.d / across
    return q.u + t * (top.axis[0] * F.ux + top.axis[1] * F.un)
  })
  const u0 = Math.max(0, Math.min(us[0], us[1]))
  const u1 = Math.min(F.L, Math.max(us[0], us[1]))
  return u1 > u0 ? [u0, u1] : null
}

/**
 * Openings that landings make on one host edge (join-core junctionsFor,
 * then join-rails railOpeningsFrom): each point landing goes to its nearest
 * host edge within 0.35 m, and opens it when its surface is within 0.3 m;
 * a wall edge only takes a landing at one of its doors. Point landings get
 * 5 cm either side; a stair or ramp wing opens exactly its top's span.
 * Deck edges of other objects that lie along this edge open it too.
 */
export function junctionOpenings(hosts: readonly HostEdge[], landings: readonly Landing[], target: { readonly mi: number; readonly i: number }): Interval[] {
  const edges = hosts.map((e) => ({ e, F: frame(e.a, e.b) })).filter((q) => q.F.L > 1e-6)
  const mine = edges.find((q) => q.e.mi === target.mi && q.e.i === target.i)
  if (!mine || mine.e.doors) return []
  const out: Interval[] = []
  const opens = (z: number) => Math.abs(z - mine.e.z) <= JOIN.dzMax
  for (const c of landings) {
    if (c.kind === 'deck-abut') {
      const cL = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1])
      if (!(cL > 1e-6) || !opens(c.z)) continue
      const F = mine.F
      const cross = Math.abs(((c.b[0] - c.a[0]) * F.un - (c.b[1] - c.a[1]) * F.ux) / cL)
      if (cross > JOIN.par) continue
      const pa = project(mine.e.a, F, c.a)
      const pb = project(mine.e.a, F, c.b)
      if (Math.abs(pa.d) > JOIN.tol || Math.abs(pb.d) > JOIN.tol) continue
      const u0 = clamp(Math.min(pa.u, pb.u), 0, F.L)
      const u1 = clamp(Math.max(pa.u, pb.u), 0, F.L)
      if (u1 - u0 >= 0.05) out.push([u0, u1])
      continue
    }
    let best: { q: (typeof edges)[number]; d: number; u0: number; u1: number; door: boolean } | null = null
    for (const q of edges) {
      const p = project(q.e.a, q.F, c.at)
      const d = Math.abs(p.d)
      if (d > JOIN.tol || p.u < -JOIN.ext || p.u > q.F.L + JOIN.ext) continue
      const hw = (c.w > 0 ? c.w : 1.2) / 2
      const u0 = clamp(p.u - hw, 0, q.F.L)
      const u1 = clamp(p.u + hw, 0, q.F.L)
      const door = !!q.e.doors
      if (door && !q.e.doors!.some(([a, b]) => Math.min(u1, b + 0.1) - Math.max(u0, a - 0.1) > 0)) continue
      if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && door && !best.door)) best = { q, d, u0, u1, door }
    }
    if (!best || best.q !== mine || !opens(c.z)) continue
    if (c.kind === 'stair-wing' || c.kind === 'ramp-wing') {
      const span = stairTopSpan(mine.e, c.top)
      if (span) {
        out.push(span)
        continue
      }
    }
    out.push([Math.max(0, best.u0 - JOIN.pad), Math.min(mine.F.L, best.u1 + JOIN.pad)])
  }
  return mergeIntervals(out)
}

/** One rail-clear hit: what keeps part of the edge open. */
export interface ClearHit {
  readonly type: 'stair' | 'ramp' | 'door' | 'path' | 'bridge'
  readonly name: string
  readonly u0: number
  readonly u1: number
}

/**
 * Clearances on one rail edge (legacy railClearancesFor): the top of a
 * stair or ramp wing, a path piece's or bridge's end within 0.5 m of the
 * edge line, and the 36 in zone in front of a door, each within 1 m of the
 * edge's surface.
 */
export function clearanceHits(edge: RailEdge, items: readonly ClearItem[]): ClearHit[] {
  const F = frame(edge.a, edge.b)
  const L = F.L
  if (!(L > 1e-6)) return []
  const hits: ClearHit[] = []
  const push = (type: ClearHit['type'], name: string, u0: number, u1: number) => {
    const a = clamp(u0, 0, L)
    const b = clamp(u1, 0, L)
    if (b - a > 1e-6) hits.push({ type, name, u0: a, u1: b })
  }
  for (const it of items) {
    if (Math.abs(it.z - edge.z) > CLEAR.dzMax) continue
    if (it.type === 'wing') {
      const [ca, cb] = stairTopCorners(it.top)
      const pa = project(edge.a, F, ca)
      const pb = project(edge.a, F, cb)
      if (Math.abs(pa.d) > CLEAR.tol || Math.abs(pb.d) > CLEAR.tol) {
        // not the edge it lands on, but a facet of a curve or octagon may cut across the stair top
        const T = frame(ca, cb)
        const zc = clipToZone(edge.a, edge.b, ca, [T.ux, T.un], it.top.axis, CLEAR.stairIn, T.L - CLEAR.stairIn, -CLEAR.stairBack, CLEAR.stairFwd)
        if (zc) push(it.kind, it.name, zc[0] * L, zc[1] * L)
        continue
      }
      let g0 = Math.min(pa.u, pb.u)
      let g1 = Math.max(pa.u, pb.u)
      if (g1 < -CLEAR.ext || g0 > L + CLEAR.ext) continue
      const sp = stairTopSpan(edge, it.top)
      if (sp && sp[0] >= -0.1 && sp[1] <= L + 0.1 && Math.min(sp[1], g1) - Math.max(sp[0], g0) > 0) [g0, g1] = sp
      push(it.kind, it.name, g0, g1)
    } else if (it.type === 'door') {
      const D = frame(it.a, it.b)
      if (!(D.L > 1e-6)) continue
      const c = clipToZone(edge.a, edge.b, it.a, [D.ux, D.un], it.nrm, -CLEAR.doorPad, D.L + CLEAR.doorPad, -CLEAR.doorBack, CLEAR.doorDepth)
      if (c) push('door', it.name, c[0] * L, c[1] * L)
    } else {
      const p = project(edge.a, F, it.at)
      const hw = (it.w > 0 ? it.w : 1.2) / 2
      if (Math.abs(p.d) > CLEAR.tol + 1e-9) continue
      if (p.u + hw < CLEAR.ext || p.u - hw > L - CLEAR.ext) continue
      push(it.type === 'bridge' ? 'bridge' : 'path', it.name, p.u - hw, p.u + hw)
    }
  }
  return hits
}

/**
 * Spans of a rail edge that run along an enclosed wall (legacy
 * wallAbutIntervals): a wall edge parallel within about 10° with both ends
 * within 0.45 m of the rail edge's line, projected onto it.
 */
export function wallAbutOpenings(edge: Pick<RailEdge, 'a' | 'b'>, walls: readonly (readonly P2[])[]): Interval[] {
  const F = frame(edge.a, edge.b)
  if (F.L < 1e-6) return []
  const out: Interval[] = []
  for (const P of walls) {
    if (P.length < 3) continue
    P.forEach((p, k) => {
      const q = P[(k + 1) % P.length]
      const WL = Math.hypot(q[0] - p[0], q[1] - p[1])
      if (WL < 1e-6) return
      if (Math.abs(((q[0] - p[0]) * F.ux + (q[1] - p[1]) * F.un) / WL) < WALL_COS) return
      const pp = project(edge.a, F, p)
      const pq = project(edge.a, F, q)
      if (Math.max(Math.abs(pp.d), Math.abs(pq.d)) > WALL_TOL_M) return
      const u0 = Math.max(0, Math.min(pp.u, pq.u))
      const u1 = Math.min(F.L, Math.max(pp.u, pq.u))
      if (u1 - u0 > 0.05) out.push([u0, u1])
    })
  }
  return out
}

/** A door's centre on its wall line, its width and floor elevation, for posts and stair tops. */
export interface DoorSpot {
  readonly c: P2
  readonly w: number
  readonly z: number
}

/** Which posts stay: those not within half a door's width plus 0.3 m of its centre (legacy porchPostKeepFor). */
export function postsClearOfDoors(points: readonly P2[], doors: readonly DoorSpot[], z: number): boolean[] {
  return points.map((p) => !doors.some((d) => Math.abs(d.z - z) <= CLEAR.dzMax && Math.hypot(p[0] - d.c[0], p[1] - d.c[1]) <= d.w / 2 + CLEAR.postPad))
}

/** A door just at a stair's top (legacy stairClearTopFor): its handrails start back from it. */
export function doorAtStairTop(top: StairTop, z: number, doors: readonly DoorSpot[]): boolean {
  const hw = top.w / 2
  return doors.some((d) => {
    if (Math.abs(d.z - z) > CLEAR.dzMax) return false
    const vx = d.c[0] - top.c[0]
    const vn = d.c[1] - top.c[1]
    const lon = vx * top.axis[0] + vn * top.axis[1]
    const lat = -vx * top.axis[1] + vn * top.axis[0]
    return Math.abs(lat) <= hw + CLEAR.clearLat && Math.abs(lon) <= CLEAR.clearLon
  })
}
