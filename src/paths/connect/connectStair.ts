import { MAX_RISER_IN, TREAD_IN, type Ground } from '../pieces'
import { FT, IN, M2F, add, dot, hyp, r6, unit, woodPiece, type P2, type PieceSpec } from './connectSpec'

/**
 * Stairs as connectors (old ext:stair-connect): risers of 7 in or less,
 * treads of 11 in, one straight run from the top down to the foot, or an
 * L-stair with a square turn landing when the gap is too short, and a
 * level pad from the stair's foot to the picked lower end when the stair
 * cannot land on it. Specs run top → foot. Pure.
 */

const RISER_M = MAX_RISER_IN * IN
/** Pads: a landing up to 8 ft long, a boardwalk beyond. */
const PAD_LANDING_MAX_FT = 8
/** A gap left at the foot longer than this gets a pad, metres. */
const PAD_MIN_M = 0.001
/** A straight run this close to the gap still fits, metres. */
const STRAIGHT_SLACK_M = 0.05
/** Each tread may stretch this much to land the foot on the end, inches. */
const STRETCH_IN = 3
/** Re-layouts for a free ground foot. */
const FLEX_TRIES = 6

/** Risers for a rise, metres (same rule as the path pieces). */
export function risersFor(riseM: number): number {
  const ri = Math.abs(riseM || 0) / IN
  return ri < 0.5 ? 0 : Math.ceil(ri / MAX_RISER_IN - 1e-9)
}

export interface StairMath {
  readonly risers: number
  readonly riserIn: number
  readonly treadIn: number
  readonly treads: number
  readonly runIn: number
  readonly runFt: number
  readonly runM: number
}

/** Riser and tread numbers for a rise, metres (old stair-connect stairMath). */
export function stairMath(riseM: number): StairMath {
  const n = risersFor(riseM)
  const ri = Math.abs(riseM || 0) / IN
  return { risers: n, riserIn: n ? ri / n : 0, treadIn: TREAD_IN, treads: Math.max(0, n - 1), runIn: n * TREAD_IN, runFt: (n * TREAD_IN) / 12, runM: n * TREAD_IN * IN }
}

/** Round up to 1e-6 so treads never come out under 11 in. */
const up6 = (v: number): number => Math.ceil(v * 1e6 - 1e-6) / 1e6
/** Piece length for n risers, feet (tread = length / risers). */
export const runFt = (n: number): number => up6((n * TREAD_IN) / 12)

export interface StairPad {
  readonly kind: 'landing' | 'boardwalk'
  readonly lenFt: number
}

export interface StairLayout {
  readonly type: 'straight' | 'L'
  /** Top → foot. */
  readonly specs: readonly PieceSpec[]
  /** Where the top sits (it may have slid along its edge). */
  readonly T: P2
  /** Where the chain ends, and where the stair itself ends. */
  readonly foot: P2
  readonly footL: P2
  readonly risers: number
  readonly risers1?: number
  readonly risers2?: number
  readonly runIn: number
  readonly pad: StairPad | null
  readonly zT: number
  readonly zF: number
  readonly landingFt: number
  readonly zLanding?: number
  readonly landingCentre?: P2
}

export interface StairLayoutOptions {
  readonly widthFt: number
  /** The top's outward direction. */
  readonly dir?: readonly [number, number] | null
  /** The edge the top sits on: it may slide along it. */
  readonly edge?: { readonly a: P2; readonly b: P2 } | null
  /** The foot is a free ground point: land where the stair ends. */
  readonly flexFoot?: boolean
  readonly ground?: Ground
}

interface Slide {
  readonly P: P2
  readonly e: P2
  readonly L: number
  readonly a: P2
  readonly m: number
}

/** The point of the edge nearest F, kept half the stair width plus 6 in off the corners. */
function slideOnEdge(edge: { readonly a: P2; readonly b: P2 }, F: P2, widthFt: number): Slide | null {
  const { a, b } = edge
  const L = hyp(b[0] - a[0], b[1] - a[1])
  if (!(L > 1e-6)) return null
  const m = Math.min(0.5, ((widthFt / 2 + 0.5) * FT) / L)
  const t = Math.max(m, Math.min(1 - m, ((F[0] - a[0]) * (b[0] - a[0]) + (F[1] - a[1]) * (b[1] - a[1])) / (L * L)))
  return { P: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], e: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], L, a, m }
}

/** A level pad from p to F, or nothing when the stair already lands there. */
function padTo(p: P2, F: P2, zF: number, widthFt: number): { spec: PieceSpec; pad: StairPad } | null {
  const gap = hyp(F[0] - p[0], F[1] - p[1])
  if (gap <= PAD_MIN_M) return null
  const u: P2 = [(F[0] - p[0]) / gap, (F[1] - p[1]) / gap]
  const lenFt = r6(gap * M2F)
  const kind = lenFt <= PAD_LANDING_MAX_FT ? 'landing' : 'boardwalk'
  return { spec: woodPiece(kind, p, u, lenFt, zF, zF, widthFt).spec, pad: { kind, lenFt } }
}

function straight(T: P2, F: P2, zT: number, zF: number, n: number, D: number, lft: number, widthFt: number): StairLayout {
  if (n < 1) return { type: 'straight', specs: [], T, foot: F, footL: T, risers: 0, runIn: 0, pad: null, zT, zF, landingFt: 0 }
  const u: P2 = D > 1e-9 ? [(F[0] - T[0]) / D, (F[1] - T[1]) / D] : [1, 0]
  // within a foot: stretch the treads a little instead of a sliver pad
  const len = D - lft * FT <= FT ? Math.max(lft, up6(D * M2F)) : lft
  const st = woodPiece('stair', T, u, len, zT, zF, widthFt)
  const p = padTo(st.P1, F, zF, widthFt)
  return { type: 'straight', specs: p ? [st.spec, p.spec] : [st.spec], T, foot: F, footL: st.P1, risers: risersFor(zT - zF), runIn: len * 12, pad: p?.pad ?? null, zT, zF, landingFt: 0 }
}

interface LPick {
  readonly n1: number
  readonly r1: number
  readonly r2: number
  readonly a: number
  readonly b: number
  readonly T: P2
  readonly miss: number
}

/**
 * Run 1 from T along u1 (the top's outward direction, else toward F), an
 * LS × LS landing, run 2 turning toward F's side. The risers above the
 * landing are picked so the foot lands as near F as possible; with an edge
 * the top slides along it to line run 2 up with F.
 */
function lStair(T: P2, F: P2, zT: number, zF: number, n: number, widthFt: number, lsFt: number, dir: P2 | null, edge: StairLayoutOptions['edge']): StairLayout {
  const LS = lsFt * FT
  const D = hyp(F[0] - T[0], F[1] - T[1])
  const u1: P2 = dir ?? (D > 1e-9 ? [(F[0] - T[0]) / D, (F[1] - T[1]) / D] : [1, 0])
  const v: P2 = [-u1[1], u1[0]]
  const s = dot([F[0] - T[0], F[1] - T[1]], v) >= 0 ? 1 : -1
  const vv: P2 = [v[0] * s, v[1] * s]
  const rh = (zT - zF) / n
  const sl = edge ? slideOnEdge(edge, F, widthFt) : null
  let best: LPick | null = null
  for (let n1 = 1; n1 < n; n1++) {
    const r1 = risersFor(n1 * rh)
    const r2 = risersFor((n - n1) * rh)
    const a = runFt(r1) * FT
    const b = runFt(r2) * FT
    let Tq: P2 = T
    if (sl) {
      const want = add(add(F, u1, -(a + LS / 2)), vv, -(LS / 2 + b))
      const t = Math.max(sl.m, Math.min(1 - sl.m, dot([want[0] - sl.a[0], want[1] - sl.a[1]], sl.e) / sl.L))
      Tq = [sl.a[0] + sl.e[0] * t * sl.L, sl.a[1] + sl.e[1] * t * sl.L]
    }
    const foot0 = add(add(Tq, u1, a + LS / 2), vv, LS / 2 + b)
    const res: P2 = [F[0] - foot0[0], F[1] - foot0[1]]
    const ru = dot(res, u1)
    const rv = dot(res, vv)
    // a short foot: stretch the treads (up to 3 in each) so the foot lands on F instead of adding a sliver pad
    const su = ru > -1e-6 ? Math.max(0, Math.min(ru, r1 * STRETCH_IN * IN)) : 0
    const sv = rv > -1e-6 ? Math.max(0, Math.min(rv, r2 * STRETCH_IN * IN)) : 0
    const foot = add(add(foot0, u1, su), vv, sv)
    const miss = hyp(foot[0] - F[0], foot[1] - F[1])
    if (!best || miss < best.miss - 1e-6) best = { n1, r1, r2, a: a + su, b: b + sv, T: Tq, miss }
  }
  const B = best as LPick
  const zL = zT - B.n1 * rh
  const p1 = woodPiece('stair', B.T, u1, Math.max(runFt(B.r1), up6(B.a * M2F)), zT, zL, widthFt)
  const ld = woodPiece('landing', p1.P1, u1, lsFt, zL, zL, widthFt, lsFt)
  const C = add(p1.P1, u1, LS / 2)
  const p2 = woodPiece('stair', add(C, vv, LS / 2), vv, Math.max(runFt(B.r2), up6(B.b * M2F)), zL, zF, widthFt)
  const p = padTo(p2.P1, F, zF, widthFt)
  return {
    type: 'L',
    specs: p ? [p1.spec, ld.spec, p2.spec, p.spec] : [p1.spec, ld.spec, p2.spec],
    T: B.T,
    foot: F,
    footL: p2.P1,
    risers: B.r1 + B.r2,
    risers1: B.r1,
    risers2: B.r2,
    runIn: (p1.spec.w + p2.spec.w) * 12,
    pad: p?.pad ?? null,
    zT,
    zF,
    landingFt: lsFt,
    zLanding: zL,
    landingCentre: C,
  }
}

/**
 * A stair from top T (level zT) down to foot F (zF ≤ zT), site metres
 * (old layoutStair): straight when one run fits, else an L-stair with a
 * landing as wide as the stair (4 ft at least). A free ground foot is
 * moved to where the L ends and the rise re-measured there.
 */
export function layoutStair(T: P2, F: P2, zT: number, zF: number, opts: StairLayoutOptions): StairLayout {
  const widthFt = opts.widthFt
  const lsFt = Math.max(4, widthFt)
  const dir = unit(opts.dir)
  const edge = opts.edge?.a && opts.edge.b ? opts.edge : null
  let foot = F
  let zFoot = zF
  let out: StairLayout | null = null
  for (let it = 0; it < FLEX_TRIES; it++) {
    const n = risersFor(zT - zFoot)
    let Tp: P2 = T
    const sl = edge ? slideOnEdge(edge, foot, widthFt) : null
    if (sl) {
      const nrm: P2 = dir ?? [-sl.e[1], sl.e[0]]
      if (dot([foot[0] - sl.P[0], foot[1] - sl.P[1]], nrm) > 0) Tp = sl.P
    }
    const D = hyp(foot[0] - Tp[0], foot[1] - Tp[1])
    const lft = runFt(n)
    if (n < 2 || D >= lft * FT - STRAIGHT_SLACK_M) return straight(Tp, foot, zT, zFoot, n, D, lft, widthFt)
    out = lStair(Tp, foot, zT, zFoot, n, widthFt, lsFt, dir, edge)
    if (!opts.flexFoot || !opts.ground || !out.pad) break
    const zn = opts.ground(out.footL[0], out.footL[1])
    if (!Number.isFinite(zn) || zT - zn < RISER_M) break
    foot = out.footL
    zFoot = zn
  }
  return out as StairLayout
}
