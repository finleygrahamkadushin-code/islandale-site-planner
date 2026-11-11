/**
 * Reading a typed number for a number field. Every field has bounds: its own,
 * or ±NUM_FIELD_LIMIT, so no field takes a number nothing on the lot could be.
 */

/** The bound for a number field that names none of its own. */
export const NUM_FIELD_LIMIT = 10_000
/** Width and depth, ft: past the lot's diagonal (about 290 ft on a 214 ft by 196 ft lot). */
export const SIZE_LIMIT_FT = 300
/** Height, ft: past the tallest trees, so a tree can be any real height. */
export const HEIGHT_LIMIT_FT = 350
/** East and North from the centre of the lot, ft: past the edge of the surveyed ground. */
export const PLACE_LIMIT_FT = 1_000
/** Rotation, degrees, either way. */
export const TURN_LIMIT_DEG = 360

export interface NumberBounds {
  readonly min?: number
  readonly max?: number
  readonly unit: string
}

const withUnit = (v: number, unit: string): string => {
  const n = v.toLocaleString('en-US')
  return unit === '°' ? `${n}°` : `${n} ${unit}`
}

/** The typed number, or the message to show under the field. */
export function readNumber(text: string, { min, max, unit }: NumberBounds): { readonly value: number } | { readonly error: string } {
  const t = text.trim()
  const v = Number(t)
  if (!t || !Number.isFinite(v)) return { error: 'Enter a number' }
  const lo = min ?? -NUM_FIELD_LIMIT
  const hi = max ?? NUM_FIELD_LIMIT
  if (v < lo) return { error: `At least ${withUnit(lo, unit)}` }
  if (v > hi) return { error: `At most ${withUnit(hi, unit)}` }
  return { value: v }
}
