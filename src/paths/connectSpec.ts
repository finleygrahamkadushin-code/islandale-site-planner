import type { PlanObject } from '../store/types'
import { KIND_LABELS, pieceEnds, type Ground, type PathKind, type Surface } from './pieces'

/**
 * The pieces Connect lays (old connectCore.seg and stair-connect piece):
 * plain specs for new path pieces, ready to become plan objects. A spec
 * runs along its rotation from end A to end B, `w` feet long and `d` feet
 * wide, with both end levels pinned. Pure.
 */

export type P2 = readonly [number, number]

/** A picked end (a SnapTarget, a wing top, a deck edge or a ground point), site metres. */
export interface ConnectEnd {
  readonly x: number
  readonly n: number
  /** Surface level, metres NAVD88; the ground when missing. */
  readonly z?: number | null
  /** Points away from what the end belongs to. */
  readonly dir?: readonly [number, number] | null
  readonly kind?: string
  readonly label?: string
  /** The deck edge the end sits on (a stair top may slide along it). */
  readonly segment?: { readonly a: P2; readonly b: P2 } | null
}

/** A picked end with its level resolved. */
export type ResolvedEnd = ConnectEnd & { readonly z: number }

export interface PieceSpec {
  readonly kind: PathKind
  readonly name: string
  /** Length A → B and width, feet. */
  readonly w: number
  readonly d: number
  /** Centre, site metres. */
  readonly position: { readonly x: number; readonly n: number }
  /** Degrees CCW from east, A → B. */
  readonly rotation: number
  /** Surface levels at A and B, metres NAVD88. */
  readonly ends: { readonly zA?: number; readonly zB?: number }
  readonly surface?: Surface
  /** Boardwalks: feet over the higher end of the ground. */
  readonly lift?: number
}

export const FT = 0.3048
export const M2F = 1 / FT
export const IN = 0.0254
/** Ramp landings, 5 ft (ADA 405.7.3). */
export const LANDING_M = 5 * FT
/** A step this small is no step, metres (half an inch). */
export const ZTOL = 0.013
/** Most rise per ramp run, metres (30 in, ADA 405.6). */
export const RAMP_RISE_MAX_M = 30 * IN
/** Width of new pieces, feet: 3 to 10, 4 by default. */
export const MIN_WIDTH_FT = 3
export const MAX_WIDTH_FT = 10
export const CONNECT_WIDTH_FT = 4

export const hyp = (a: number, b: number): number => Math.sqrt(a * a + b * b)
export const r6 = (v: number): number => Math.round(v * 1e6) / 1e6
export const normDeg = (a: number): number => {
  const v = ((a % 360) + 360) % 360
  return v >= 360 - 1e-9 ? 0 : v
}
export const unit = (d: readonly number[] | null | undefined): [number, number] | null => {
  if (!d) return null
  const l = hyp(d[0], d[1])
  return l > 1e-9 ? [d[0] / l, d[1] / l] : null
}
export const add = (p: P2, u: P2, s: number): [number, number] => [p[0] + u[0] * s, p[1] + u[1] * s]
export const dot = (a: P2, b: P2): number => a[0] * b[0] + a[1] * b[1]
export const clampWidth = (w: unknown): number => Math.max(MIN_WIDTH_FT, Math.min(MAX_WIDTH_FT, typeof w === 'number' && Number.isFinite(w) ? w : CONNECT_WIDTH_FT))

/** The end's level, or the ground under it. */
export const zOf = (t: ConnectEnd, ground: Ground): number => (typeof t.z === 'number' && Number.isFinite(t.z) ? t.z : ground(t.x, t.n))

/** Text for the UI. */
export const pct = (s: number): string => `${(Math.abs(s) * 100).toFixed(1)} %`
export const ftTxt = (m: number): string => `${Math.round(m * M2F)} ft`
export const ftE = (z: number): string => `${(z * M2F).toFixed(1)} ft`
export const stepTxt = (dz: number): string => (Math.abs(dz) < 0.3 ? `${(Math.abs(dz) / IN).toFixed(0)} in` : `${(Math.abs(dz) * M2F).toFixed(1)} ft`)
export const short = (lbl: string | undefined): string => {
  const s = lbl ?? ''
  return s.length > 34 ? `${s.slice(0, 33)}…` : s
}
export function ftIn(inches: number): string {
  const t = Math.round(Math.abs(inches))
  const f = Math.floor(t / 12)
  const i = t % 12
  return f ? `${f} ft${i ? ` ${i} in` : ''}` : `${i} in`
}

const SEG_SURFACE: Readonly<Record<PathKind, Surface>> = { walk: 'gravel', boardwalk: 'boardwalk', ramp: 'concrete', stair: 'concrete', landing: 'concrete' }

function spec(kind: PathKind, P0: P2, P1: P2, lenFt: number, z0: number, z1: number, d: number, surface: Surface): PieceSpec {
  return {
    kind,
    name: KIND_LABELS[kind],
    w: r6(lenFt),
    d,
    position: { x: r6((P0[0] + P1[0]) / 2), n: r6((P0[1] + P1[1]) / 2) },
    rotation: r6(normDeg((Math.atan2(P1[1] - P0[1], P1[0] - P0[0]) * 180) / Math.PI)),
    ends: { zA: r6(z0), zB: r6(z1) },
    surface,
  }
}

/** A piece from P0 (end A, level z0) to P1 (end B, z1) (old seg); landings are at least 5 ft wide. */
export function seg(kind: PathKind, P0: P2, P1: P2, z0: number, z1: number, widthFt: number): PieceSpec {
  const L = hyp(P1[0] - P0[0], P1[1] - P0[1])
  return spec(kind, P0, P1, L * M2F, z0, z1, kind === 'landing' ? Math.max(5, widthFt) : widthFt, SEG_SURFACE[kind])
}

/**
 * A wood piece `lenFt` long from P0 along unit u (old stair-connect piece):
 * the length is given, not measured, so treads stay exact.
 */
export function woodPiece(kind: PathKind, P0: P2, u: P2, lenFt: number, z0: number, z1: number, widthFt: number, depthFt = widthFt): { spec: PieceSpec; P0: P2; P1: P2 } {
  const P1 = add(P0, u, lenFt * FT)
  return { spec: spec(kind, P0, P1, lenFt, z0, z1, depthFt, 'boardwalk'), P0, P1 }
}

/** The same piece run the other way (B becomes A). */
export const reverseSpec = (p: PieceSpec): PieceSpec => ({
  ...p,
  rotation: r6(normDeg(p.rotation + 180)),
  ends: { zA: p.ends.zB, zB: p.ends.zA },
})

/** The spec as the plan-object fields the path-piece helpers read. */
export const specAsPiece = (p: PieceSpec): Pick<PlanObject, 'position' | 'rotation' | 'params'> => ({
  position: p.position,
  rotation: p.rotation,
  params: { kind: p.kind, w: p.w, d: p.d, ends: p.ends, ...(p.surface ? { surface: p.surface } : {}), ...(p.lift !== undefined ? { lift: p.lift } : {}) },
})

export interface SpecEnds {
  readonly A: P2
  readonly B: P2
  readonly zA: number
  readonly zB: number
}

/** End points and walking levels of a spec (old specEnds + specZ): walks drape, landings sit level at the higher end. */
export function specEnds(p: PieceSpec, ground: Ground): SpecEnds {
  const E = pieceEnds(specAsPiece(p), ground)
  return { A: E.A, B: E.B, zA: E.zA, zB: E.zB }
}
