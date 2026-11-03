import { DEFAULT_SURFACE, type PathKind, type Surface } from './pieces'

/**
 * A new path piece to add, as the auto route and the piece fixes lay them
 * (old spec / pieceSpec): kind, length `w` and width `d` in feet, centre in
 * site metres, rotation in degrees CCW, and its end levels pinned.
 */
export interface PieceSpec {
  readonly kind: PathKind
  /** Length, feet. */
  readonly w: number
  /** Width, feet. */
  readonly d: number
  readonly position: { readonly x: number; readonly n: number }
  readonly rotation: number
  readonly ends: { readonly zA: number; readonly zB: number }
  readonly surface: Surface
  readonly rail: 'auto'
  /** Boardwalks: feet over the ground (0: on its ends). */
  readonly lift?: number
  /** Part of a switchback group. */
  readonly switchback?: boolean
}

export const FT = 0.3048
export const D2R = Math.PI / 180

export const r4 = (v: number): number => Math.round(v * 1e4) / 1e4

/** Degrees in [0, 360), whole when within 1e-6 of whole, else to 4 places. */
export function normDeg(a: number): number {
  let v = a % 360
  if (v < 0) v += 360
  return Math.abs(v - Math.round(v)) < 1e-6 ? Math.round(v) % 360 : r4(v)
}

/** A piece from end A to end B (site metres) with its end levels. */
export function specBetween(kind: PathKind, A: readonly [number, number], B: readonly [number, number], zA: number, zB: number, deg: number, widthFt: number): PieceSpec {
  const w = Math.hypot(B[0] - A[0], B[1] - A[1]) / FT
  const s: PieceSpec = {
    kind,
    w: r4(w),
    d: Math.round(widthFt * 100) / 100,
    position: { x: r4((A[0] + B[0]) / 2), n: r4((A[1] + B[1]) / 2) },
    rotation: normDeg(deg),
    ends: { zA: r4(zA), zB: r4(zB) },
    surface: DEFAULT_SURFACE[kind],
    rail: 'auto',
  }
  return kind === 'boardwalk' ? { ...s, lift: 0 } : s
}
