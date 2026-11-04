/**
 * Numbers as an architect writes them on a drawing: 12'-6 1/4", 7 1/4",
 * 312 sq ft, 47°. Lengths round to the nearest quarter inch.
 */

const MINUS = '−'
const FRACTION: Readonly<Record<number, string>> = { 1: '1/4', 2: '1/2', 3: '3/4' }

/** Whole inches and quarters of a non-negative quarter count: 29 → 7 1/4; `bare` drops a lone 0 before a fraction (1/2, not 0 1/2). */
function inchText(quarters: number, bare: boolean): string {
  const whole = Math.floor(quarters / 4)
  const frac = FRACTION[quarters % 4]
  if (!frac) return `${whole}`
  return whole === 0 && bare ? frac : `${whole} ${frac}`
}

const sign = (v: number, quarters: number) => (v < 0 && quarters > 0 ? MINUS : '')

/** Feet as 12'-6", 12'-6 1/4", 0'-9 1/2", −2'-0", to the nearest 1/4 inch. */
export function formatArch(ft: number): string {
  if (!Number.isFinite(ft)) return '—'
  const quarters = Math.round(Math.abs(ft) * 48)
  const feet = Math.floor(quarters / 48)
  return `${sign(ft, quarters)}${feet}'-${inchText(quarters - feet * 48, false)}"`
}

/** A level above (or below) the main floor with its sign: +2'-11", −0'-1 1/4". */
export const formatLevel = (ft: number): string => `${ft >= 0 ? '+' : ''}${formatArch(ft)}`

/** Inches as 7 1/4", 1/2", 11", to the nearest 1/4 inch. */
export function formatInches(inches: number): string {
  if (!Number.isFinite(inches)) return '—'
  const quarters = Math.round(Math.abs(inches) * 4)
  return `${sign(inches, quarters)}${inchText(quarters, true)}"`
}

/** Square feet, whole, with thousands separated: 1,204 sq ft. */
export function formatArea(sqft: number): string {
  if (!Number.isFinite(sqft)) return '—'
  return `${Math.round(sqft).toLocaleString('en-US')} sq ft`
}

/** Whole degrees: 47°. */
export function formatDeg(deg: number): string {
  if (!Number.isFinite(deg)) return '—'
  const r = Math.round(deg)
  return `${r < 0 ? MINUS : ''}${Math.abs(r)}°`
}
