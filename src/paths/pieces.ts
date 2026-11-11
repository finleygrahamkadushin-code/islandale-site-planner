import { localToSite, num, type LocalPoint } from '../buildings/footprint'
import type { PlanObject } from '../store/types'
import type { SitePoint } from '../site/types'
import { M_PER_FT as FT } from '../site/units'

/**
 * Path pieces (old ext:walk-model): a pad with a `kind` (walk, ramp,
 * stair, landing, boardwalk) runs along its local x from end A (−w/2) to
 * end B (+w/2), `w` feet long and `d` feet wide. Walks drape on the
 * ground; the other kinds run straight between their end levels, which
 * are pinned in `ends` ({zA, zB}, metres NAVD88) or taken from the ground
 * (a boardwalk sits `lift` feet over its higher end). Pure: the ground is
 * passed in.
 */

export type PathKind = 'walk' | 'ramp' | 'stair' | 'landing' | 'boardwalk'
export type Surface = 'gravel' | 'concrete' | 'pavers' | 'boardwalk' | 'grass'
export type Ground = (x: number, n: number) => number

export const PATH_KINDS: readonly PathKind[] = ['walk', 'ramp', 'stair', 'landing', 'boardwalk']
export const SURFACES: readonly Surface[] = ['gravel', 'concrete', 'pavers', 'boardwalk', 'grass']
export const SURFACE_COLORS: Readonly<Record<Surface, string>> = { gravel: '#8c8c86', concrete: '#b9b6ae', pavers: '#9a8f82', boardwalk: '#b08a5a', grass: '#7ba360' }
export const DEFAULT_SURFACE: Readonly<Record<PathKind, Surface>> = { walk: 'gravel', ramp: 'concrete', stair: 'concrete', landing: 'concrete', boardwalk: 'boardwalk' }
/** New pieces, feet. */
export const DEFAULT_LENGTH: Readonly<Record<PathKind, number>> = { walk: 20, ramp: 12, stair: 8, landing: 5, boardwalk: 16 }
export const DEFAULT_WIDTH: Readonly<Record<PathKind, number>> = { walk: 4, ramp: 4, stair: 4, landing: 5, boardwalk: 4 }
export const KIND_LABELS: Readonly<Record<PathKind, string>> = { walk: 'Walk', ramp: 'Ramp', stair: 'Stair', landing: 'Landing', boardwalk: 'Boardwalk' }

const IN = 0.0254
/** Stairs: risers of 7 in or less, treads of 11 in or more. */
export const MAX_RISER_IN = 7
export const TREAD_IN = 11
/** Handrail and guard heights, and the drop that calls for a guard, inches. */
export const RAIL_IN = 34
export const GUARD_IN = 36
export const GUARD_DROP_IN = 30
export const CURB_IN = 2

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isKind = (k: unknown): k is PathKind => (PATH_KINDS as readonly unknown[]).includes(k)

export const pieceKind = (o: Pick<PlanObject, 'params'>): PathKind => (isKind(o.params.kind) ? o.params.kind : 'walk')
export const pieceLength = (o: Pick<PlanObject, 'params'>): number => (num(o.params.w, 0) > 0 ? num(o.params.w, 0) : DEFAULT_LENGTH[pieceKind(o)])
export const pieceWidth = (o: Pick<PlanObject, 'params'>): number => (num(o.params.d, 0) > 0 ? num(o.params.d, 0) : pieceKind(o) === 'landing' ? 5 : 4)
export const pieceSurface = (o: Pick<PlanObject, 'params'>): Surface =>
  (SURFACES as readonly unknown[]).includes(o.params.surface) ? (o.params.surface as Surface) : DEFAULT_SURFACE[pieceKind(o)]

/** Is this pad a path piece: a kind, or (old rule) a narrow or ribbon pad that is not a driveway or parking. */
export function isPathPiece(o: Pick<PlanObject, 'type' | 'name' | 'params'>): boolean {
  if (o.type !== 'pad') return false
  if (isKind(o.params.kind)) return true
  if (o.params.kind) return false
  if (num(o.params.cars, 0) > 0) return false
  if (/drive|park|trailer/i.test(o.name)) return false
  return o.params.shape === 'ribbon' || (num(o.params.d, 0) > 0 && num(o.params.d, 0) < 8)
}

/** Parking and arrival pads (the start of an accessible route). */
export const isDriveway = (o: Pick<PlanObject, 'type' | 'name' | 'params'>): boolean =>
  o.type === 'pad' && !o.params.kind && (num(o.params.cars, 0) > 0 || /drive|park|trailer|arrival/i.test(o.name))

/** The centreline in local feet: A (−w/2, 0) to B (+w/2, 0); a kindless ribbon follows its points. */
export function centreline(o: Pick<PlanObject, 'params'>): LocalPoint[] {
  const pts = o.params.pts
  if (!isKind(o.params.kind) && o.params.shape === 'ribbon' && Array.isArray(pts) && pts.length >= 2)
    return (pts as number[][]).map((p): LocalPoint => [num(p[0], 0), num(p[1], 0)])
  const w = pieceLength(o)
  return [[-w / 2, 0], [w / 2, 0]]
}

export interface PieceEnds {
  readonly A: SitePoint
  readonly B: SitePoint
  /** Ground at each end, metres. */
  readonly gA: number
  readonly gB: number
  /** Walking surface at each end, metres. */
  readonly zA: number
  readonly zB: number
  readonly kind: PathKind
}

export function pieceEnds(o: Pick<PlanObject, 'position' | 'rotation' | 'params'>, ground: Ground): PieceEnds {
  const C = centreline(o)
  const A = localToSite(o.position, o.rotation, C[0])
  const B = localToSite(o.position, o.rotation, C[C.length - 1])
  const gA = ground(A[0], A[1])
  const gB = ground(B[0], B[1])
  const kind = pieceKind(o)
  let zA = gA
  let zB = gB
  if (kind !== 'walk') {
    const e = (o.params.ends && typeof o.params.ends === 'object' ? o.params.ends : {}) as Record<string, unknown>
    const pA = fin(e.zA) ? e.zA : null
    const pB = fin(e.zB) ? e.zB : null
    if (kind === 'boardwalk') {
      const top = Math.max(gA, gB) + num(o.params.lift, 0) * FT
      zA = pA ?? top
      zB = pB ?? top
    } else {
      zA = pA ?? gA
      zB = pB ?? gB
    }
    if (kind === 'landing') zA = zB = Math.max(zA, zB)
  }
  return { A, B, gA, gB, zA, zB, kind }
}

export interface ProfilePoint {
  /** Distance along the centreline from A, metres. */
  readonly s: number
  readonly x: number
  readonly n: number
  /** Walking surface, metres. */
  readonly z: number
  /** Cross slope (rise over run), walks only. */
  readonly cross: number
}

/** The walking surface every `step` metres from A to B. */
export function pieceProfile(o: Pick<PlanObject, 'position' | 'rotation' | 'params'>, ground: Ground, step = 0.5): ProfilePoint[] {
  const E = pieceEnds(o, ground)
  const C = centreline(o).map((p) => localToSite(o.position, o.rotation, p))
  const seg: number[] = []
  let L = 0
  for (let i = 0; i + 1 < C.length; i++) {
    const l = Math.hypot(C[i + 1][0] - C[i][0], C[i + 1][1] - C[i][1])
    seg.push(l)
    L += l
  }
  const N = Math.max(1, Math.ceil(L / step - 1e-9))
  const hw = (pieceWidth(o) * FT) / 2
  const out: ProfilePoint[] = []
  for (let i = 0; i <= N; i++) {
    const s = (L * i) / N
    let acc = 0
    let j = 0
    while (j < seg.length - 1 && acc + seg[j] < s - 1e-12) acc += seg[j++]
    const f = seg[j] > 0 ? Math.min(1, Math.max(0, (s - acc) / seg[j])) : 0
    const p = C[j]
    const q = C[j + 1]
    const x = p[0] + (q[0] - p[0]) * f
    const n = p[1] + (q[1] - p[1]) * f
    const tl = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
    const tx = (q[0] - p[0]) / tl
    const tn = (q[1] - p[1]) / tl
    let z: number
    let cross = 0
    if (E.kind === 'walk') {
      z = ground(x, n)
      const zl = ground(x - tn * hw, n + tx * hw)
      const zr = ground(x + tn * hw, n - tx * hw)
      cross = hw > 0 ? Math.abs(zl - zr) / (2 * hw) : 0
    } else z = L > 0 ? E.zA + ((E.zB - E.zA) * s) / L : E.zA
    out.push({ s, x, n, z, cross })
  }
  return out
}

export interface StairInfo {
  /** Metres and inches. */
  readonly rise: number
  readonly riseIn: number
  readonly risers: number
  readonly riserIn: number
  readonly treads: number
  readonly treadIn: number
  /** The shortest run that gives 11 in treads, feet. */
  readonly minRunFt: number
  readonly ok: boolean
}

/** Risers and treads for the rise between the ends over the piece's length (old stairMath). */
export function stairInfo(o: Pick<PlanObject, 'position' | 'rotation' | 'params'>, ground: Ground): StairInfo {
  const E = pieceEnds(o, ground)
  const rise = Math.abs(E.zB - E.zA)
  const riseIn = rise / IN
  const lenFt = pieceLength(o)
  const risers = riseIn < 0.5 ? 0 : Math.ceil(riseIn / MAX_RISER_IN - 1e-9)
  const riserIn = risers ? riseIn / risers : 0
  const treadIn = risers ? (lenFt * 12) / risers : 0
  return {
    rise,
    riseIn,
    risers,
    riserIn,
    treads: Math.max(0, risers - 1),
    treadIn,
    minRunFt: (Math.max(0, risers - 1) * TREAD_IN) / 12,
    ok: risers === 0 || (riserIn <= MAX_RISER_IN + 1e-9 && treadIn >= TREAD_IN - 1e-9),
  }
}

/** Largest height of the walking surface over the ground under it (centreline and both edges), metres. */
export function maxDrop(o: Pick<PlanObject, 'position' | 'rotation' | 'params'>, ground: Ground): number {
  const E = pieceEnds(o, ground)
  const w = pieceLength(o)
  const d = pieceWidth(o)
  const N = Math.max(2, Math.ceil(w / 2))
  let m = 0
  for (let i = 0; i <= N; i++) {
    const f = i / N
    const z = E.zA + (E.zB - E.zA) * f
    for (const lz of [-d / 2, 0, d / 2]) {
      const p = localToSite(o.position, o.rotation, [-w / 2 + w * f, lz])
      m = Math.max(m, z - ground(p[0], p[1]))
    }
  }
  return m
}

/**
 * Does the piece get rails: handrails on a ramp rising more than 6 in or a
 * stair of 4 risers or more, guards on a landing or boardwalk more than 30
 * in up; `rail` true or false overrides.
 */
export function railOn(o: Pick<PlanObject, 'position' | 'rotation' | 'params'>, ground: Ground): boolean {
  if (o.params.rail === true) return true
  if (o.params.rail === false) return false
  const k = pieceKind(o)
  if (k === 'walk') return false
  const E = pieceEnds(o, ground)
  if (k === 'ramp') return Math.abs(E.zB - E.zA) > 6 * IN
  if (k === 'stair') return stairInfo(o, ground).risers >= 4
  return maxDrop(o, ground) > GUARD_DROP_IN * IN
}

/** Slope of a ramp or walk end to end (rise over run), 0 for a flat one. */
export function pieceSlope(o: Pick<PlanObject, 'position' | 'rotation' | 'params'>, ground: Ground): number {
  const E = pieceEnds(o, ground)
  const run = pieceLength(o) * FT
  return run > 0 ? Math.abs(E.zB - E.zA) / run : 0
}
