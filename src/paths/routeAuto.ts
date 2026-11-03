import type { PlanObject } from '../store/types'
import type { Ground } from './pieces'
import { emitLeg } from './routeAutoEmit'
import { GRID, LAND, makePath, planRuns, trimKink, type LegPath, type RunOptions, type RunPlan } from './routeAutoPlan'
import { drivewayStart } from './routeCollect'
import type { P2, RouteAnchor } from './routeGraph'
import { D2R, FT, type PieceSpec } from './routeSpec'

/**
 * Auto route (old walkAutoRoute): the pieces from a start (a driveway
 * point or a piece end) to a goal (a door, a wing top or a ramp foot):
 * straight, or a two-leg dogleg round building walls, ponds and pools;
 * each leg keeps whole-degree rotations by hosting the odd angle in a walk
 * or an end landing. Pure: returns new piece specs, never touches the
 * store.
 */

export interface RoutePoint {
  readonly x: number
  readonly n: number
  /** Surface to meet; the ground when absent. */
  readonly z?: number
  /** Facing out of what it belongs to. */
  readonly dir?: P2 | null
}

export interface AutoRouteOptions {
  readonly from: RoutePoint
  readonly to: RoutePoint
  readonly ground: Ground
  /** Closed outlines to go round, site metres. */
  readonly obstacles?: readonly (readonly P2[])[]
  /** Route width, feet (3 or more; 4 by default). */
  readonly widthFt?: number
  readonly prefer?: 'ramp' | 'stair'
}

export interface AutoRoute {
  readonly pieces: readonly PieceSpec[]
  readonly warnings: readonly string[]
  /** The dogleg's corner, when it has one. */
  readonly corner: { readonly x: number; readonly n: number } | null
}

type Opt = RunOptions & { readonly widthFt: number }

const crossZ = (o: P2, p: P2, q: P2) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
function pointSegDist(p: P2, s: P2, e: P2): number {
  const vx = e[0] - s[0]
  const vy = e[1] - s[1]
  const L2 = vx * vx + vy * vy
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - s[0]) * vx + (p[1] - s[1]) * vy) / L2)) : 0
  return Math.hypot(p[0] - s[0] - t * vx, p[1] - s[1] - t * vy)
}
function segSegDist(a: P2, b: P2, c: P2, d: P2): number {
  const d1 = crossZ(c, d, a)
  const d2 = crossZ(c, d, b)
  const d3 = crossZ(a, b, c)
  const d4 = crossZ(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0
  return Math.min(pointSegDist(a, c, d), pointSegDist(b, c, d), pointSegDist(c, a, b), pointSegDist(d, a, b))
}
function inPoly(P: readonly P2[], x: number, y: number): boolean {
  let c = false
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i]
    const b = P[j]
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}
function segPolyDist(a: P2, b: P2, P: readonly P2[]): number {
  if (inPoly(P, a[0], a[1]) || inPoly(P, b[0], b[1])) return 0
  return P.reduce((m, p, i) => Math.min(m, segSegDist(a, b, p, P[(i + 1) % P.length])), Infinity)
}
/** Is P–Q (trimmed tP and tQ at its ends) at least `clr` from every obstacle. */
function clearSeg(P: P2, Q: P2, obs: readonly (readonly P2[])[], clr: number, tP: number, tQ: number): boolean {
  const L = Math.hypot(Q[0] - P[0], Q[1] - P[1])
  if (L <= tP + tQ + 1e-6) return true
  const ux = (Q[0] - P[0]) / L
  const un = (Q[1] - P[1]) / L
  const a: P2 = [P[0] + ux * tP, P[1] + un * tP]
  const b: P2 = [Q[0] - ux * tQ, Q[1] - un * tQ]
  return obs.every((poly) => segPolyDist(a, b, poly) >= clr)
}

/** The cheapest clear corner for a two-leg dogleg, null when straight is clear; blocked when none is. */
export function findCorner(S: P2, T: P2, obs: readonly (readonly P2[])[], W: number, dirS: P2 | null, dirT: P2 | null): { corner: P2 | null; blocked?: boolean } {
  const clr = W / 2 + 0.15
  const tr = W / 2 + 0.3
  if (!obs.length || clearSeg(S, T, obs, clr, tr, tr)) return { corner: null }
  const L = Math.hypot(T[0] - S[0], T[1] - S[1])
  const ux = (T[0] - S[0]) / L
  const un = (T[1] - S[1]) / L
  const cands: P2[] = []
  for (const poly of obs) {
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
    const cn = poly.reduce((s, p) => s + p[1], 0) / poly.length
    for (const p of poly) {
      const d = Math.hypot(p[0] - cx, p[1] - cn) || 1
      for (const e of [0.6, 1.2, 2.4]) cands.push([p[0] + ((p[0] - cx) / d) * (W / 2 + e), p[1] + ((p[1] - cn) / d) * (W / 2 + e)])
    }
  }
  for (const f of [0.25, 0.5, 0.75]) {
    const mx = S[0] + (T[0] - S[0]) * f
    const mn = S[1] + (T[1] - S[1]) * f
    for (let d = 1.5; d <= 60; d += 1.5) cands.push([mx - un * d, mn + ux * d], [mx + un * d, mn - ux * d])
  }
  for (const [p, dir] of [[T, dirT], [S, dirS]] as const) {
    if (!dir) continue
    const l = Math.hypot(dir[0], dir[1]) || 1
    for (let k = 1.5; k <= 12; k += 0.75) cands.push([p[0] + (dir[0] / l) * k, p[1] + (dir[1] / l) * k])
  }
  const scored = cands
    .map((c): { C: P2; cost: number } => {
      const C: P2 = [Math.round(c[0] / GRID) * GRID, Math.round(c[1] / GRID) * GRID]
      return { C, cost: Math.hypot(C[0] - S[0], C[1] - S[1]) + Math.hypot(T[0] - C[0], T[1] - C[1]) }
    })
    .sort((p, q) => p.cost - q.cost)
  const hit = scored.find(
    ({ C }) =>
      !obs.some((poly) => inPoly(poly, C[0], C[1])) &&
      Math.hypot(C[0] - S[0], C[1] - S[1]) >= 0.5 &&
      Math.hypot(T[0] - C[0], T[1] - C[1]) >= 0.5 &&
      clearSeg(S, C, obs, clr, tr, 0) &&
      clearSeg(C, T, obs, clr, 0, tr),
  )
  return hit ? { corner: hit.C } : { corner: null, blocked: true }
}

const emit = (path: LegPath, plan: RunPlan, opt: Opt) => ({ pieces: emitLeg(path, plan, { ground: opt.ground, widthFt: opt.widthFt, W: opt.W }), warn: plan.warn })

/** One leg with whole-degree directions and exact closure. */
function routeLeg(P: P2, Q: P2, zP: number, zQ: number, opt: Opt): { pieces: PieceSpec[]; warn: readonly string[] } {
  const dx = Q[0] - P[0]
  const dn = Q[1] - P[1]
  const L = Math.hypot(dx, dn)
  if (L < 0.05) return { pieces: [], warn: [] }
  const a = Math.atan2(dn, dx) / D2R
  const a0 = Math.round(a)
  const del = a - a0
  if (Math.abs(del) < 1e-6) {
    const path = makePath(P, [{ deg: a0, len: L }])
    return emit(path, planRuns(path, zP, zQ, opt), opt)
  }
  const chord = makePath(P, [{ deg: a, len: L }])
  const plan1 = planRuns(chord, zP, zQ, opt)
  const ad = Math.abs(del)
  const sg = del > 0 ? 1 : -1
  // host the off-direction chunk (a0 ± K°, K ≤ 30, no landing needed) inside the longest walk
  const host = plan1.iv.reduce<(typeof plan1.iv)[number] | null>((h, v) => (v.type === 'walk' && (!h || v.s1 - v.s0 > h.s1 - h.s0) ? v : h), null)
  if (host && host.s1 - host.s0 > 0.6) {
    const H = host.s1 - host.s0
    for (let K = 1; K <= 30; K++) {
      const sK = Math.sin(K * D2R)
      const off = (L * Math.sin(ad * D2R)) / sK
      const M = (L * Math.sin((K - ad) * D2R)) / sK
      if (off > 0.6 * H) continue
      const M1 = Math.max(0, Math.min(M, (host.s0 + host.s1) / 2 - off / 2))
      const path2 = makePath(P, [{ deg: a0, len: M1 }, { deg: a0 + sg * K, len: off }, { deg: a0, len: M - M1 }])
      const plan2 = planRuns(path2, zP, zQ, opt)
      if (path2.verts.every((v) => plan2.iv.some((iv) => iv.type === 'walk' && v >= iv.s0 - 1e-6 && v <= iv.s1 + 1e-6))) return emit(path2, plan2, opt)
      break
    }
  }
  // host it in the first or last landing of a ramp or switchback group that starts at P or ends at Q
  for (const atEnd of [false, true]) {
    for (let K = 30; K >= 1; K--) {
      const sK = Math.sin(K * D2R)
      const off = (L * Math.sin(ad * D2R)) / sK
      const M = (L * Math.sin((K - ad) * D2R)) / sK
      if (off < LAND + 1e-6 || K <= ad) continue
      const turn = { deg: a0 + sg * K, len: off }
      const path3 = makePath(P, atEnd ? [{ deg: a0, len: M }, turn] : [turn, { deg: a0, len: M }])
      const plan3 = planRuns(path3, zP, zQ, opt)
      const v = path3.verts[0]
      const ok = plan3.iv.some((iv) => v >= iv.s0 - 1e-6 && v <= iv.s1 + 1e-6 && (iv.type === 'walk' || ((iv.type === 'ramp' || iv.type === 'switch') && !!trimKink(path3, iv.s0, iv.s1))))
      if (ok) return emit(path3, plan3, opt)
      break
    }
  }
  const e = emit(chord, plan1, opt)
  return { pieces: e.pieces, warn: ['Could not keep whole-degree rotations on one leg.', ...e.warn] }
}

export function autoRoute(opts: AutoRouteOptions): AutoRoute {
  const { from, to, ground } = opts
  const widthFt = Math.max(3, opts.widthFt ?? 4)
  const W = widthFt * FT
  const S: P2 = [from.x, from.n]
  const T: P2 = [to.x, to.n]
  const zS = Number.isFinite(from.z) ? from.z! : ground(S[0], S[1])
  const zT = Number.isFinite(to.z) ? to.z! : ground(T[0], T[1])
  const obs = (opts.obstacles ?? []).filter((p) => p.length >= 3)
  const fc = findCorner(S, T, obs, W, from.dir ?? null, to.dir ?? null)
  const opt: Opt = { ground, prefer: opts.prefer === 'stair' ? 'stair' : 'ramp', W, widthFt }
  const legs = fc.corner
    ? [routeLeg(S, fc.corner, zS, ground(fc.corner[0], fc.corner[1]), opt), routeLeg(fc.corner, T, ground(fc.corner[0], fc.corner[1]), zT, opt)]
    : [routeLeg(S, T, zS, zT, opt)]
  const warn = [...(fc.blocked ? ['No clear 2-segment dogleg around the obstacles — straight line used.'] : []), ...legs.flatMap((l) => l.warn)]
  return {
    pieces: legs.flatMap((l) => l.pieces),
    warnings: warn.filter((w, i) => warn.indexOf(w) === i),
    corner: fc.corner ? { x: fc.corner[0], n: fc.corner[1] } : null,
  }
}

/** From the point of a driveway nearest the goal to a door, wing top or ramp foot anchor (old Route panel). */
export function autoRouteFromDriveway(
  driveway: PlanObject,
  goal: RouteAnchor,
  ground: Ground,
  opts: Omit<AutoRouteOptions, 'from' | 'to' | 'ground'> = {},
): AutoRoute {
  const from = drivewayStart(driveway, goal, ground)
  return autoRoute({ ...opts, from, to: { x: goal.x, n: goal.n, z: goal.z, dir: goal.dir }, ground })
}
