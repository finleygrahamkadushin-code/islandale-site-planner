import { num } from '../buildings/footprint'
import type { PlanObject } from '../store/types'
import { pieceEnds, pieceKind, pieceLength, pieceSurface, type Ground, type PathKind } from './pieces'
import type { IssueCode, RouteIssue } from './routeCheck'
import { D2R, FT, normDeg, r4, type PieceSpec } from './routeSpec'
import { refreshedEnds, snapSolve } from './snap'
import type { SnapTarget } from './targets'

/**
 * Fix piece (old walkFixPiece): the one-click fix for a piece's first
 * issue, as the piece's new params (and centre if it moves) plus any new
 * pieces to add beside it, or null when there is no automatic fix. Pure:
 * nothing is written; the caller applies it as one undo step.
 */

export type FixCode = IssueCode | 'stair'

/** The issue to fix: its code, and for steps and gaps the level to meet; the text tells a turn's landing end. */
export interface FixIssue {
  readonly code: FixCode
  readonly text?: string
  readonly fix?: string
  readonly join?: RouteIssue['join']
}

export interface FixContext {
  readonly ground: Ground
  /** Which end stays put when the piece grows (default: the higher end). */
  readonly keep?: 'A' | 'B'
  /** For a sloped walk: lengthen it, or make it a ramp (default: lengthen when the ground allows). */
  readonly mode?: 'lengthen' | 'ramp'
  /** Snap targets, so a gap is closed by snapping. */
  readonly targets?: readonly SnapTarget[]
}

export interface PieceFix {
  readonly params: Readonly<Record<string, unknown>>
  readonly position: { readonly x: number; readonly n: number }
  readonly rotation: number
  readonly add: readonly PieceSpec[]
  readonly note: string
}

type Piece = Pick<PlanObject, 'position' | 'rotation' | 'params'>
type Seg = { kind: PathKind; len: number; z0: number; z1: number }
type Laid = { kind: PathKind; x: number; n: number; w: number; ends: { zA: number; zB: number } }

const IN = 0.0254
const LAND = 5 * FT
const RISE_MAX = 30 * IN

function geom(o: Piece, ground: Ground) {
  const a = o.rotation * D2R
  const c = Math.cos(a)
  const s = Math.sin(a)
  const L = pieceLength(o) * FT
  const E = pieceEnds(o, ground)
  const A: [number, number] = [o.position.x - (c * L) / 2, o.position.n - (s * L) / 2]
  return { A, c, s, L, zA: E.zA, zB: E.zB, walkish: pieceKind(o) === 'walk' }
}
type Geom = ReturnType<typeof geom>

/** Lay segments along the piece's axis (A → B), anchored so the kept end stays put. */
function layAlong(G: Geom, segs: readonly Seg[], keep: 'A' | 'B'): Laid[] {
  const total = segs.reduce((t, q) => t + q.len, 0)
  let t = keep === 'B' ? G.L - total : 0
  return segs.map((q) => {
    const p0 = [G.A[0] + G.c * t, G.A[1] + G.s * t]
    t += q.len
    const p1 = [G.A[0] + G.c * t, G.A[1] + G.s * t]
    return { kind: q.kind, x: r4((p0[0] + p1[0]) / 2), n: r4((p0[1] + p1[1]) / 2), w: Math.round((q.len / FT) * 1e4) / 1e4, ends: { zA: r4(q.z0), zB: r4(q.z1) } }
  })
}

function specOf(o: Piece, g: Laid): PieceSpec {
  const d = num(o.params.d, 0) || 4
  return {
    kind: g.kind,
    w: g.w,
    d: g.kind === 'landing' ? Math.max(d, 5) : d,
    position: { x: g.x, n: g.n },
    rotation: normDeg(o.rotation),
    ends: g.ends,
    surface: g.kind === 'landing' || g.kind === 'ramp' ? 'concrete' : pieceSurface(o),
    rail: 'auto',
  }
}

const fix = (o: Piece, patch: Record<string, unknown>, note: string, at?: { x: number; n: number }, add: PieceSpec[] = [], rotation = o.rotation): PieceFix => ({
  params: { ...o.params, ...patch },
  position: at ?? o.position,
  rotation,
  add,
  note,
})

/** The fix's family, from the issue code (old classify). */
function family(code: FixCode): 'rail' | 'width' | 'cross' | 'level' | 'join' | 'split' | 'landing' | 'stair' | 'slope' {
  switch (code) {
    case 'handrail':
      return 'rail'
    case 'width':
      return 'width'
    case 'cross-slope':
      return 'cross'
    case 'landing-level':
      return 'level'
    case 'step':
    case 'gap':
      return 'join'
    case 'ramp-rise':
      return 'split'
    case 'landing-top':
    case 'landing-bottom':
    case 'turn':
      return 'landing'
    case 'stair':
      return 'stair'
    default:
      return 'slope'
  }
}

export function fixPiece(o: Piece, issue: FixIssue, ctx: FixContext): PieceFix | null {
  const G = geom(o, ctx.ground)
  const kind = pieceKind(o)
  const rise = Math.abs(G.zB - G.zA)
  const hiEnd: 'A' | 'B' = G.zB >= G.zA ? 'B' : 'A'
  const keep = ctx.keep ?? hiEnd
  const ends = { zA: r4(G.zA), zB: r4(G.zB) }
  const lengthenTo = (lim: number) => {
    const nl = Math.max(pieceLength(o), Math.ceil(rise / FT / lim - 1e-9))
    const g = layAlong(G, [{ kind, len: nl * FT, z0: G.zA, z1: G.zB }], keep)[0]
    return { w: nl, at: { x: g.x, n: g.n } }
  }
  switch (family(issue.code)) {
    case 'rail':
      return fix(o, { rail: true }, 'Handrails on both sides (ADA 405.8).')
    case 'width': {
      const d = Math.max(4, Math.ceil(num(o.params.d, 0)))
      return fix(o, { d }, `Widened to ${d} ft (≥ 36 in clear, ADA 403.5.1).`)
    }
    case 'cross':
      return fix(o, { kind: 'boardwalk', lift: 0, surface: 'boardwalk', ends }, 'Built as a level-across boardwalk (cross slope ≤ 1:48).')
    case 'level': {
      const zl = r4(Math.max(G.zA, G.zB))
      return fix(o, { ends: { zA: zl, zB: zl } }, 'Landing levelled.')
    }
    case 'join':
      return joinFix(o, G, issue, ctx)
    case 'split':
      return kind === 'ramp' ? splitFix(o, G, rise, hiEnd) : null
    case 'landing':
      return landingFix(o, G, issue, hiEnd)
    case 'stair': {
      const u = lengthenTo(1 / 12)
      return fix(o, { w: u.w, ends, kind: 'ramp', surface: 'concrete', rail: 'auto' }, `Stairs replaced by a 1:12 ramp, ${u.w} ft${rise > RISE_MAX ? ' — then split it at 30 in.' : '.'}`, u.at)
    }
    case 'slope':
      return slopeFix(o, G, kind, rise, ends, lengthenTo, ctx)
  }
}

function joinFix(o: Piece, G: Geom, issue: FixIssue, ctx: FixContext): PieceFix | null {
  const j = issue.join
  if (issue.code === 'gap' && ctx.targets?.length) {
    const snap = snapSolve(o, ctx.ground, ctx.targets, j?.end ?? null)
    if (snap) {
      const moved = { ...o, position: snap.position, rotation: snap.rotation }
      const e = refreshedEnds(moved, ctx.ground, ctx.targets)
      return fix(o, e ? { ends: e } : {}, `Snapped to ${snap.target.label}.`, snap.position, [], snap.rotation)
    }
  }
  if (!j || !Number.isFinite(j.z)) return null
  const e = { zA: r4(G.zA), zB: r4(G.zB), [`z${j.end}`]: r4(j.z) } as { zA: number; zB: number }
  if (!G.walkish) return fix(o, { ends: e }, `End ${j.end} set to meet the next piece.`)
  // walks drape and ignore `ends`: rebuild as a piece that keeps them
  const sl = G.L > 0 ? Math.abs(e.zB - e.zA) / G.L : 1
  if (sl > 1 / 12 + 1e-9) return null
  const k2 = sl > 0.05 ? 'ramp' : 'boardwalk'
  return fix(o, { kind: k2, surface: k2 === 'ramp' ? 'concrete' : 'boardwalk', lift: 0, rail: 'auto', ends: e }, `Built as a ${k2} so end ${j.end} meets the next piece.`)
}

function splitFix(o: Piece, G: Geom, rise: number, hiEnd: 'A' | 'B'): PieceFix {
  const nR = Math.max(2, Math.ceil(rise / RISE_MAX - 1e-9))
  const runT = Math.max(G.L - (nR - 1) * LAND, (Math.ceil(((rise * 12) / FT) * 2 - 1e-9) / 2) * FT)
  const len = runT / nR
  const dz = (G.zB - G.zA) / nR
  const segs: Seg[] = []
  for (let i = 0; i < nR; i++) {
    const z = G.zA + dz * i
    segs.push({ kind: 'ramp', len, z0: z, z1: i === nR - 1 ? G.zB : z + dz })
    if (i < nR - 1) segs.push({ kind: 'landing', len: LAND, z0: z + dz, z1: z + dz })
  }
  const laid = layAlong(G, segs, hiEnd)
  const first = laid[0]
  return fix(
    o,
    { w: first.w, ends: first.ends },
    `Split into ${nR} runs ≤ 30 in rise with 5 ft landings (ADA 405.6, 405.7).`,
    { x: first.x, n: first.n },
    laid.slice(1).map((g) => specOf(o, g)),
  )
}

function landingFix(o: Piece, G: Geom, issue: FixIssue, hiEnd: 'A' | 'B'): PieceFix {
  const t = `${issue.text ?? ''} ${issue.fix ?? ''} ${issue.code}`.toLowerCase()
  const end: 'A' | 'B' = /\btop\b/.test(t) ? hiEnd : /\bbottom\b/.test(t) ? (hiEnd === 'A' ? 'B' : 'A') : /\bend a\b/.test(t) ? 'A' : /\bend b\b/.test(t) ? 'B' : hiEnd
  const zE = end === 'A' ? G.zA : G.zB
  const zO = end === 'A' ? G.zB : G.zA
  const nl = G.L - LAND
  if (pieceKind(o) === 'ramp' && nl >= 3 * FT && Math.abs(zE - zO) * 12 <= nl * (1 + 1e-9)) {
    // room inside: shorten the ramp, the landing takes its last 5 ft
    const segs: Seg[] =
      end === 'B'
        ? [{ kind: 'ramp', len: nl, z0: G.zA, z1: G.zB }, { kind: 'landing', len: LAND, z0: G.zB, z1: G.zB }]
        : [{ kind: 'landing', len: LAND, z0: G.zA, z1: G.zA }, { kind: 'ramp', len: nl, z0: G.zA, z1: G.zB }]
    const laid = layAlong(G, segs, 'A')
    const rp = end === 'B' ? laid[0] : laid[1]
    const ld = end === 'B' ? laid[1] : laid[0]
    return fix(o, { w: rp.w, ends: rp.ends }, `Added a 5 ft landing at end ${end} (ramp shortened to ${rp.w.toFixed(1)} ft).`, { x: rp.x, n: rp.n }, [specOf(o, ld)])
  }
  const t1 = end === 'B' ? G.L : -LAND
  const p0 = [G.A[0] + G.c * t1, G.A[1] + G.s * t1]
  const p1 = [p0[0] + G.c * LAND, p0[1] + G.s * LAND]
  const ld: Laid = { kind: 'landing', x: r4((p0[0] + p1[0]) / 2), n: r4((p0[1] + p1[1]) / 2), w: 5, ends: { zA: r4(zE), zB: r4(zE) } }
  return fix(o, {}, `Added a 5 ft landing beyond end ${end} — re-snap the next piece to it.`, undefined, [specOf(o, ld)])
}

function slopeFix(
  o: Piece,
  G: Geom,
  kind: PathKind,
  rise: number,
  ends: { zA: number; zB: number },
  lengthenTo: (lim: number) => { w: number; at: { x: number; n: number } },
  ctx: FixContext,
): PieceFix {
  const pinned = G.walkish ? {} : { ends }
  if (kind === 'ramp') {
    const u = lengthenTo(1 / 12)
    return fix(o, { w: u.w, ...pinned }, `Lengthened to ${u.w} ft for 1:12.`, u.at)
  }
  if (kind === 'boardwalk' || kind === 'landing') {
    const u = lengthenTo(0.05)
    return fix(o, { w: u.w, ...pinned }, `Lengthened to ${u.w} ft for 1:20.`, u.at)
  }
  // a draped walk: lengthen it for 1:20 when the ground there allows, else make it a ramp
  const slope = G.L > 0 ? rise / G.L : 0
  const tryLen = ctx.mode === 'lengthen' || (ctx.mode !== 'ramp' && slope * 12 <= 1 + 1e-9)
  if (tryLen) {
    const u = lengthenTo(0.05)
    const hw = (u.w / 2) * FT
    const PA = [u.at.x - G.c * hw, u.at.n - G.s * hw]
    const PB = [u.at.x + G.c * hw, u.at.n + G.s * hw]
    const groundOk = Math.abs(ctx.ground(PB[0], PB[1]) - ctx.ground(PA[0], PA[1])) / (u.w * FT) <= 0.05 + 1e-9
    if (ctx.mode === 'lengthen' || groundOk) return fix(o, { w: u.w }, `Lengthened to ${u.w} ft for 1:20 (ADA 403.3).`, u.at)
  }
  const u = lengthenTo(1 / 12)
  const longer = u.w > pieceLength(o) ? `, lengthened to ${u.w} ft for 1:12` : ''
  return fix(o, { w: u.w, ends, kind: 'ramp', surface: 'concrete', rail: 'auto' }, `Converted to a ramp${longer}${rise > RISE_MAX ? ' — then split it at 30 in.' : '.'}`, u.at)
}
