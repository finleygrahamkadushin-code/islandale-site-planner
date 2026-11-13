import type { Parcel, SitePoint } from '../types'
import { mToFt } from '../units'
import { pointInLot, shoreLotLineDistance } from './setbacks'

/**
 * The lot-width rule (5E, old `lotWidthCheck`): buildings may take up at
 * most half the lot's width, measured through the building point nearest
 * the shore, or 40 ft where the lot is under 80 ft wide there. Pure:
 * parcel and outlines (site metres) in, feet out.
 */

/** Directions tried for the narrowest chord, degrees. */
const SWEEP_STEP_DEG = 2
const SWEEP_LAST_DEG = 178
/** Under this lot width (ft) the allowance is a flat 40 ft. These three are assumed (review R2.8): no code section named; see ruleSources. */
export const NARROW_LOT_FT = 80
export const NARROW_ALLOWED_FT = 40
export const WIDTH_SHARE = 0.5

export interface LotWidth {
  /** The building point nearest the shore (plain distance). */
  readonly at: SitePoint
  /** Unit direction of the narrowest chord through it. */
  readonly dir: SitePoint
  readonly lotFt: number
  readonly usedFt: number
  readonly allowedFt: number
  readonly ok: boolean
}

export const allowedWidthFt = (lotFt: number): number => (lotFt < NARROW_LOT_FT ? NARROW_ALLOWED_FT : WIDTH_SHARE * lotFt)

/**
 * The lot's width along the line through p in unit direction d, metres: from
 * the first to the last place the line crosses the lot line (the old
 * planner's max − min), so a ragged shore edge can't cut the width short.
 * Null when the line crosses fewer than twice.
 */
export function chordM(parcel: Parcel, p: SitePoint, d: SitePoint): number | null {
  const ring = parcel.ring
  const ts: number[] = []
  for (let i = 0; i < ring.length; i++) {
    const t = crossAt(p, d, ring[i], ring[(i + 1) % ring.length])
    if (t !== null) ts.push(t)
  }
  return ts.length >= 2 ? Math.max(...ts) - Math.min(...ts) : null
}

/** Where the line p + t·d crosses segment a→b, as t; null when it misses or runs parallel. */
function crossAt(p: SitePoint, d: SitePoint, a: SitePoint, b: SitePoint): number | null {
  const ex = b[0] - a[0]
  const en = b[1] - a[1]
  const den = d[0] * en - d[1] * ex
  if (Math.abs(den) < 1e-12) return null
  const ax = a[0] - p[0]
  const an = a[1] - p[1]
  const t = (ax * en - an * ex) / den
  const s = (ax * d[1] - an * d[0]) / den
  return s >= 0 && s <= 1 ? t : null
}

/** The narrowest chord through p over the sweep: its direction and length, metres. */
export function narrowestChord(parcel: Parcel, p: SitePoint): { dir: SitePoint; m: number } | null {
  let best: { dir: SitePoint; m: number } | null = null
  for (let deg = 0; deg <= SWEEP_LAST_DEG; deg += SWEEP_STEP_DEG) {
    const a = (deg * Math.PI) / 180
    const dir: SitePoint = [Math.cos(a), Math.sin(a)]
    const m = chordM(parcel, p, dir)
    if (m !== null && (!best || m < best.m)) best = { dir, m }
  }
  return best
}

/** Total length of the outlines' shadows on direction d (overlaps counted once), metres. */
export function usedWidthM(outlines: readonly (readonly SitePoint[])[], d: SitePoint): number {
  const spans = outlines
    .filter((poly) => poly.length)
    .map((poly) => {
      const us = poly.map(([x, n]) => x * d[0] + n * d[1])
      return [Math.min(...us), Math.max(...us)] as const
    })
    .sort((a, b) => a[0] - b[0])
  let total = 0
  let cur: [number, number] | null = null
  for (const [a, b] of spans) {
    if (cur && a <= cur[1]) cur = [cur[0], Math.max(cur[1], b)]
    else {
      if (cur) total += cur[1] - cur[0]
      cur = [a, b]
    }
  }
  return cur ? total + cur[1] - cur[0] : total
}

/** The lot-width rule over every building outline; null with no outlines or no chord through the seaward point. */
export function lotWidthCheck(parcel: Parcel, outlines: readonly (readonly SitePoint[])[]): LotWidth | null {
  const at = seawardPoint(parcel, outlines.flat())
  // a seaward point on or past the lot line has no width through it to measure
  if (!at || !pointInLot(parcel, at[0], at[1])) return null
  const chord = narrowestChord(parcel, at)
  if (!chord) return null
  const lotFt = mToFt(chord.m)
  const usedFt = mToFt(usedWidthM(outlines, chord.dir))
  const allowedFt = allowedWidthFt(lotFt)
  return { at, dir: chord.dir, lotFt, usedFt, allowedFt, ok: usedFt <= allowedFt }
}

/**
 * The point nearest the shore by plain distance to the lot line along the
 * water (no bank offset). Not to the high-water line: every point below it is
 * 0 from it, so the pick would fall to whichever came first.
 */
function seawardPoint(parcel: Parcel, pts: readonly SitePoint[]): SitePoint | null {
  let best: { p: SitePoint; d: number } | null = null
  for (const p of pts) {
    const d = shoreLotLineDistance(parcel, p[0], p[1])
    if (Number.isFinite(d) && (!best || d < best.d)) best = { p, d }
  }
  return best?.p ?? null
}
