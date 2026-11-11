import { buildingMasses, massBuildingPoly, type Mass } from '../buildings/masses'
import * as G from './geom'
import type { Poly, Pt } from './geom'

/**
 * A floor's envelope (old INT.model.envelopeOf): the enclosed parts of the
 * cabin on that floor as convex tiles, their outline, the open parts
 * (porches and decks) rooms of type porch may fill, and the stairs and
 * ramps. Curved outlines are simplified to chords that stay inside the
 * 0.5 ft wall band, so rooms, openings and partitions work on straight
 * edges while the smooth outline is kept for drawing.
 */
export interface Envelope {
  /** Smooth outline for drawing, when a curved part was simplified. */
  readonly smooth: Poly[] | null
  readonly masses: Poly[]
  readonly tiles: Poly[]
  readonly loops: Poly[]
  readonly edges: [Pt, Pt][]
  readonly area: number
  /** Floor inside the walls as built (to the smooth outline), square feet: a little more than `area` on a curved cabin, whose chords cut inside the curve. */
  readonly smoothArea: number
  readonly open: Poly[]
  readonly openTiles: Poly[]
  readonly access: { readonly m: Mass; readonly P: Poly }[]
  readonly bbox: G.Box
  readonly bboxAll: G.Box
}

/** Chords stay within this of a curve, feet (inside the 0.5 ft exterior wall band). */
export const PLAN_TOL = 0.4
const CONCAVE_TOL = 0.2
/** Outlines with fewer corners are never simplified. */
const CURVED_MIN = 13
/** Wings at lvl 9 belong to the second floor. */
const FLOOR_HEIGHT_FT = 9
/** On upper floors only parts at least this tall (ft) are enclosed. */
const TALL_FT = 15

/** The floor a part at level `lvl` (feet above the main floor) belongs to. */
export const floorAtLevel = (lvl: number): number => Math.round(lvl / FLOOR_HEIGHT_FT)

const isAccess = (m: Mass) => m.kind === 'stair' || m.kind === 'ramp'
const isPts = (P: readonly (readonly number[])[] | undefined): P is Poly => Array.isArray(P) && P.length >= 3

/** Make the curve one straight chord, wide enough for a door, at each landing point. */
function flatten(P: Poly, flats: readonly Pt[]): { P: Poly; fixed: Pt[] } {
  if (!flats.length) return { P, fixed: [] }
  let Q = P.slice()
  const fixed: Pt[] = []
  for (const f of flats) {
    const ne = G.nearestEdge(Q, f)
    if (!ne || ne.d > 12) continue
    const n = Q.length
    const cum = [0]
    for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(Q[i % n][0] - Q[i - 1][0], Q[i % n][1] - Q[i - 1][1]))
    const s0 = cum[ne.i] + ne.t * (cum[ne.i + 1] - cum[ne.i])
    const per = cum[n]
    const at = (s: number) => {
      s = ((s % per) + per) % per
      let i = 0
      while (i < n - 1 && cum[i + 1] < s) i++
      return i
    }
    for (let h = 3; h >= 1.75; h -= 0.25) {
      const ia = at(s0 - h)
      const ib = (at(s0 + h) + 1) % n
      if (ia === ib) continue
      const A = Q[ia]
      const B = Q[ib]
      const L = Math.hypot(B[0] - A[0], B[1] - A[1])
      if (L < 3.4) continue
      let dm = 0
      let cnt = 0
      for (let i = (ia + 1) % n; i !== ib; i = (i + 1) % n) {
        cnt++
        dm = Math.max(dm, Math.abs((B[0] - A[0]) * (Q[i][1] - A[1]) - (B[1] - A[1]) * (Q[i][0] - A[0])) / L)
      }
      if (dm > 0.45 || cnt > n / 4) continue
      const keep: Poly = []
      for (let i = ib; i !== ia; i = (i + 1) % n) keep.push(Q[i])
      keep.push(A)
      Q = keep
      fixed.push(A, B)
      break
    }
  }
  return { P: Q, fixed }
}

/** Douglas–Peucker on a closed curve, keeping concave stretches tight and the landing chords. */
function dpClosed(P0: Poly, tol: number, flats: readonly Pt[]): Poly {
  if (P0.length < CURVED_MIN) return P0
  const fl = flatten(P0, flats)
  const P = fl.P
  const n = P.length
  let i0 = 0
  let i1 = 0
  let bd = -1
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1])
    if (d > bd) {
      bd = d
      i1 = i
    }
  }
  bd = -1
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(P[i][0] - P[i1][0], P[i][1] - P[i1][1])
    if (d > bd) {
      bd = d
      i0 = i
    }
  }
  const keep = new Uint8Array(n)
  keep[i0] = keep[i1] = 1
  const sg = G.sarea(P) >= 0 ? 1 : -1
  for (const q of fl.fixed) {
    const i = P.indexOf(q)
    if (i >= 0) keep[i] = 1
  }
  const rec = (a: number, b: number): void => {
    const A = P[a]
    const B = P[b]
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-9
    let k = -1
    let dm = 0
    for (let i = (a + 1) % n; i !== b; i = (i + 1) % n) {
      const d = Math.abs((B[0] - A[0]) * (P[i][1] - A[1]) - (B[1] - A[1]) * (P[i][0] - A[0])) / L
      if (d > dm) {
        dm = d
        k = i
      }
    }
    if (k >= 0 && dm > tol) {
      keep[k] = 1
      rec(a, k)
      rec(k, b)
    } else if (k >= 0) {
      // a concave stretch: the chord would leave the wall, so keep it tight
      let kk = -1
      let dk = 0
      for (let i = (a + 1) % n; i !== b; i = (i + 1) % n) {
        const c = (sg * ((B[0] - A[0]) * (P[i][1] - A[1]) - (B[1] - A[1]) * (P[i][0] - A[0]))) / L
        if (c > dk) {
          dk = c
          kk = i
        }
      }
      if (kk >= 0 && dk > CONCAVE_TOL) {
        keep[kk] = 1
        rec(a, kk)
        rec(kk, b)
      }
    }
  }
  const ks: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) ks.push(i)
  ks.forEach((a, j) => rec(a, ks[(j + 1) % ks.length]))
  const Q = P.filter((_, i) => keep[i])
  return Q.length >= 3 && G.area(Q) > 0.5 * G.area(P) ? Q : P
}

/** Where curved walls get a straight chord for a door: each stair or ramp's top, or floor 0's pinned `flats`. */
export function landings(params: Record<string, unknown>, masses: readonly Mass[] = buildingMasses(params)): Pt[] {
  const floors = Array.isArray(params.floors) ? params.floors : []
  const f0 = floors[0] as { flats?: unknown } | undefined
  if (f0 && Array.isArray(f0.flats)) return (f0.flats as unknown[]).filter((p): p is Pt => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  return masses.filter(isAccess).map((m): Pt => {
    const a = (m.rot * Math.PI) / 180
    return [m.dx - (m.d / 2) * Math.sin(a), m.dz - (m.d / 2) * Math.cos(a)]
  })
}

/** Merge a curved envelope's triangles back into a few convex tiles (keeps clipping fast). */
function mergeConvex(tiles: Poly[]): Poly[] {
  const T = tiles.slice()
  let changed = true
  let guard = 0
  while (changed && guard++ < 400) {
    changed = false
    outer: for (let i = 0; i < T.length; i++)
      for (let j = i + 1; j < T.length; j++) {
        if (!G.sharedSegments(T[i], T[j]).some((s) => s.len > 0.01)) continue
        const U = G.unionPieces([T[i], T[j]])
        if (U.outer.length !== 1 || U.holes.length || !G.isConvex(U.outer[0])) continue
        if (Math.abs(G.area(U.outer[0]) - G.area(T[i]) - G.area(T[j])) > 1e-3) continue
        T[i] = G.ensureCCW(U.outer[0])
        T.splice(j, 1)
        changed = true
        break outer
      }
  }
  return T
}

/** The plan outline of one part (simplified when curved), in building feet. */
export function planPoly(params: Record<string, unknown>, m: Mass, masses: readonly Mass[] = buildingMasses(params)): Poly {
  const P = massBuildingPoly(m) as Poly
  return isPts(P) && !m.open ? dpClosed(P, PLAN_TOL, landings(params, masses)) : P
}

/**
 * The parts whose walls enclose floor fi: every walled part on the main
 * floor; above it, the tall ones, or the main part when none is tall.
 */
export function enclosedOn<T extends { readonly m: Mass; readonly i: number }>(list: readonly T[], fi: number): T[] {
  const encl = list.filter((e) => !e.m.open)
  if (fi < 1) return encl
  const tall = encl.filter((e) => e.m.h >= TALL_FT)
  return tall.length ? tall : list.filter((e) => e.i === 0)
}

const cache = new Map<string, Envelope>()
const CACHE_MAX = 64
const ZERO_BOX: G.Box = { x1: 0, z1: 0, x2: 0, z2: 0, w: 0, d: 0 }

export function envelopeOf(params: Record<string, unknown>, fi = 0): Envelope {
  const all = buildingMasses(params)
  const raw = all.map((m) => massBuildingPoly(m) as Poly)
  const floors = Array.isArray(params.floors) ? params.floors : []
  const key = `${fi}${JSON.stringify(raw)}${JSON.stringify(all.map((m) => [m.kind, m.open, m.h, m.lvl]))}${JSON.stringify((floors[0] as { flats?: unknown } | undefined)?.flats ?? 0)}`
  const hit = cache.get(key)
  if (hit) return hit
  const onFloor = (m: Mass) => floorAtLevel(m.lvl) === fi
  const lands = landings(params, all)
  const polys = raw.map((P, i) => (isPts(P) && !all[i].open ? dpClosed(P, PLAN_TOL, lands) : P))
  const list = all.flatMap((m, i) => (isPts(polys[i]) && G.area(polys[i]) > G.EPS ? [{ m, i, P: G.ensureCCW(polys[i]) }] : []))
  const encl = enclosedOn(list, fi)
  const M = encl.map((e) => e.P)
  const simplified = encl.some((e) => raw[e.i] !== polys[e.i])
  let tiles = M.length ? G.disjointTiles(M) : []
  if (simplified) tiles = mergeConvex(tiles)
  const loops = tiles.length ? G.unionPieces(tiles).outer : []
  const edges: [Pt, Pt][] = loops.flatMap((L) => L.map((p, i): [Pt, Pt] => [p, L[(i + 1) % L.length]]))
  const open = list.filter((e) => e.m.open && !isAccess(e.m) && onFloor(e.m)).map((e) => e.P)
  let openTiles = open.length ? G.disjointTiles(open) : []
  for (const T of tiles) {
    if (!openTiles.length) break
    openTiles = G.subtractRegion(openTiles, T)
  }
  let smooth: Poly[] | null = null
  if (simplified) {
    const SM = encl.map((e) => G.ensureCCW(raw[e.i]))
    smooth = SM.length === 1 ? SM : G.unionPieces(G.disjointTiles(SM)).outer
    if (!smooth.length) smooth = null
  }
  const tilesArea = tiles.reduce((s, T) => s + G.area(T), 0)
  const env: Envelope = {
    smooth,
    masses: M,
    tiles,
    loops,
    edges,
    area: tilesArea,
    smoothArea: smooth ? smooth.reduce((s, L) => s + G.area(L), 0) : tilesArea,
    open,
    openTiles,
    access: list.filter((e) => isAccess(e.m) && onFloor(e.m)).map((e) => ({ m: e.m, P: e.P })),
    bbox: M.length ? G.bbox(M) : ZERO_BOX,
    bboxAll: list.length ? G.bbox(list.map((e) => e.P)) : ZERO_BOX,
  }
  if (cache.size >= CACHE_MAX) cache.clear()
  cache.set(key, env)
  return env
}

const smoothCache = new WeakMap<Envelope, Poly[]>()

/** The floor inside the walls as built, as convex tiles: the smooth outline cut up (slow on a long curve, so only on demand), else the tiles. */
export function smoothTilesOf(env: Envelope): Poly[] {
  if (!env.smooth) return env.tiles
  let T = smoothCache.get(env)
  if (!T) {
    T = G.disjointTiles(env.smooth)
    smoothCache.set(env, T)
  }
  return T
}
