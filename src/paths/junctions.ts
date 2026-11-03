import type { PathKind } from './pieces'
import type { ObjectId } from '../store/types'

/**
 * The junction model (old ext:join-core junctionsFor): where something
 * meets a building's or deck's edge. A host lends edges (free deck and
 * porch edges take anything; an enclosed wall only takes what lands on
 * one of its doors); candidates are path-piece and bridge ends, its own
 * stair and ramp tops, and other decks' free edges laid along it. Each
 * junction records the step (dz, metres) and the horizontal gap. Pure,
 * site metres.
 */

type P2 = readonly [number, number]

/** An end this close to an edge line lands on it, metres. */
export const TOL_M = 0.35
/** Slack past an edge's ends, metres. */
const EXT_M = 0.05
/** Within ½ in counts as flush, metres. */
export const LEVEL_M = 0.013
/** A larger horizontal gap means not snapped, metres. */
export const GAP_M = 0.05
/** Abutting edges must run within 10° of each other. */
const PAR = Math.sin((10 * Math.PI) / 180)
/** A door takes an end whose width overlaps it, with this slack each side, metres. */
const DOOR_SLACK_M = 0.1
/** Width of a point candidate without one, metres. */
const DEFAULT_W_M = 1.2

export type JunctionKind = 'piece' | 'bridge' | 'stair-wing' | 'ramp-wing' | 'deck-abut'

/** A door or slider on a host wall edge, metres along the edge from its first vertex. */
export interface DoorSpan {
  readonly u0: number
  readonly u1: number
  /** "door", "slider", or numbered when the part has more than one ("door 2"). */
  readonly label: string
  readonly kind: 'door' | 'slider'
}

/** An edge things can land on. */
export interface HostEdge {
  readonly owner: ObjectId
  readonly mi: number
  readonly i: number
  readonly a: P2
  readonly b: P2
  /** Outward unit normal. */
  readonly nrm: P2
  /** Walking surface, metres NAVD88. */
  readonly z: number
  readonly accept: 'all' | 'doors'
  readonly doors: readonly DoorSpan[]
  /** "Deck 2 front edge", "main floor back wall". */
  readonly label: string
}

/** What a junction's other side is: a piece or bridge end, a wing of the host, or another deck's edge. */
export interface JunctionOther {
  readonly id: ObjectId
  readonly end?: 'A' | 'B'
  readonly mi?: number
  readonly i?: number
}

export interface PointCandidate {
  readonly kind: 'piece' | 'bridge' | 'stair-wing' | 'ramp-wing'
  readonly other: JunctionOther
  readonly x: number
  readonly n: number
  readonly z: number
  /** Width, metres. */
  readonly w: number
  readonly name: string
  readonly pieceKind?: PathKind
  /** A wing never lands on its own mass. */
  readonly skipMi?: number
}

export interface SegmentCandidate {
  readonly kind: 'deck-abut'
  readonly other: JunctionOther
  readonly owner: ObjectId
  readonly a: P2
  readonly b: P2
  readonly z: number
  readonly name: string
}

export type Candidate = PointCandidate | SegmentCandidate

export interface Junction {
  readonly edge: { readonly mi: number; readonly i: number }
  readonly kind: JunctionKind
  readonly other: JunctionOther
  /** Span along the edge, metres from its first vertex, and the landing point. */
  readonly u0: number
  readonly u1: number
  readonly u: number
  readonly zOther: number
  readonly zHere: number
  /** zOther − zHere, metres: positive when the other side is higher. */
  readonly dz: number
  /** Horizontal distance off the edge line, metres. */
  readonly gapM: number
  /** 1 outside the edge, −1 inside, 0 unknown. */
  readonly side: number
  readonly label: string
  readonly name: string
  readonly pieceKind?: PathKind
  readonly door?: DoorSpan
  /** The point on the edge line, site metres. */
  readonly at: P2
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

interface Frame {
  readonly L: number
  readonly ux: number
  readonly un: number
}

function frame(e: Pick<HostEdge, 'a' | 'b'>): Frame {
  const dx = e.b[0] - e.a[0]
  const dn = e.b[1] - e.a[1]
  const L = Math.hypot(dx, dn)
  return { L, ux: L ? dx / L : 1, un: L ? dn / L : 0 }
}

/** Along (u) and signed offset left of a → b (d). */
function project(e: Pick<HostEdge, 'a'>, F: Frame, x: number, n: number): { u: number; d: number } {
  const px = x - e.a[0]
  const pn = n - e.a[1]
  return { u: px * F.ux + pn * F.un, d: -px * F.un + pn * F.ux }
}

const pointAt = (e: HostEdge, F: Frame, u: number): P2 => [e.a[0] + F.ux * u, e.a[1] + F.un * u]

function abutJunctions(c: SegmentCandidate, E: readonly { e: HostEdge; F: Frame }[], tol: number): Junction[] {
  const cL = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1])
  if (!(cL > 1e-6)) return []
  return E.flatMap(({ e, F }): Junction[] => {
    if (e.accept === 'doors' || c.owner === e.owner) return []
    const cross = Math.abs(((c.b[0] - c.a[0]) * F.un - (c.b[1] - c.a[1]) * F.ux) / cL)
    if (cross > PAR) return []
    const pa = project(e, F, c.a[0], c.a[1])
    const pb = project(e, F, c.b[0], c.b[1])
    if (Math.abs(pa.d) > tol || Math.abs(pb.d) > tol) return []
    const u0 = clamp(Math.min(pa.u, pb.u), 0, F.L)
    const u1 = clamp(Math.max(pa.u, pb.u), 0, F.L)
    if (u1 - u0 < 0.05) return []
    const zO = fin(c.z) ? c.z : e.z
    const u = (u0 + u1) / 2
    return [{ edge: { mi: e.mi, i: e.i }, kind: 'deck-abut', other: c.other, u0, u1, u, zOther: zO, zHere: e.z, dz: zO - e.z, gapM: (Math.abs(pa.d) + Math.abs(pb.d)) / 2, side: 0, label: e.label, name: c.name, at: pointAt(e, F, u) }]
  })
}

function pointJunction(c: PointCandidate, E: readonly { e: HostEdge; F: Frame }[], tol: number): Junction | null {
  if (!fin(c.x) || !fin(c.n)) return null
  let best: { e: HostEdge; F: Frame; u: number; d: number; u0: number; u1: number; door: DoorSpan | null; side: number } | null = null
  for (const { e, F } of E) {
    if (c.skipMi !== undefined && c.skipMi === e.mi) continue
    const p = project(e, F, c.x, c.n)
    const d = Math.abs(p.d)
    if (d > tol || p.u < -EXT_M || p.u > F.L + EXT_M) continue
    const hw = (fin(c.w) && c.w > 0 ? c.w : DEFAULT_W_M) / 2
    const u0 = clamp(p.u - hw, 0, F.L)
    const u1 = clamp(p.u + hw, 0, F.L)
    let door: DoorSpan | null = null
    if (e.accept === 'doors') {
      let ovBest = 0
      for (const dr of e.doors) {
        const ov = Math.min(u1, dr.u1 + DOOR_SLACK_M) - Math.max(u0, dr.u0 - DOOR_SLACK_M)
        if (ov > ovBest) {
          ovBest = ov
          door = dr
        }
      }
      if (!door) continue
    }
    const side = (c.x - e.a[0]) * e.nrm[0] + (c.n - e.a[1]) * e.nrm[1] >= 0 ? 1 : -1
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && door && !best.door)) best = { e, F, u: p.u, d, u0, u1, door, side }
  }
  if (!best) return null
  const { e, F } = best
  const zO = fin(c.z) ? c.z : e.z
  const u = clamp(best.u, 0, F.L)
  return {
    edge: { mi: e.mi, i: e.i },
    kind: c.kind,
    other: c.other,
    u0: best.u0,
    u1: best.u1,
    u,
    zOther: zO,
    zHere: e.z,
    dz: zO - e.z,
    gapM: best.d,
    side: best.side,
    label: best.door ? best.door.label : e.label,
    name: c.name,
    ...(c.pieceKind ? { pieceKind: c.pieceKind } : {}),
    ...(best.door ? { door: best.door } : {}),
    at: pointAt(e, F, u),
  }
}

/** Every junction of the candidates on the edges, sorted by edge then position along it. */
export function junctionsFor(edges: readonly HostEdge[], candidates: readonly Candidate[], tol = TOL_M): Junction[] {
  const E = edges.map((e) => ({ e, F: frame(e) })).filter((q) => q.F.L > 1e-6)
  const out = candidates.flatMap((c): Junction[] => {
    if (c.kind === 'deck-abut') return abutJunctions(c, E, tol)
    const j = pointJunction(c, E, tol)
    return j ? [j] : []
  })
  return out.sort((a, b) => a.edge.mi - b.edge.mi || a.edge.i - b.edge.i || a.u0 - b.u0)
}

/** Flush: within ½ in and not more than 5 cm off the edge. */
export const isFlush = (j: Pick<Junction, 'dz' | 'gapM'>): boolean => Math.abs(j.dz) <= LEVEL_M && !(j.gapM > GAP_M)

/** Two junction records describe the same junction. */
export function sameJunction(a: Junction, b: Junction): boolean {
  return (
    a.kind === b.kind &&
    a.edge.mi === b.edge.mi &&
    a.edge.i === b.edge.i &&
    a.other.id === b.other.id &&
    (a.other.end ?? '') === (b.other.end ?? '') &&
    (a.other.mi ?? null) === (b.other.mi ?? null) &&
    (a.other.i ?? null) === (b.other.i ?? null)
  )
}
