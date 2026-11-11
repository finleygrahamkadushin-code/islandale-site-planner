/**
 * Lengths typed the way a builder writes them: 2' 9", 2'9, 33in, 33", 2.75,
 * 2 ft 9 in, 5 ft. 6 in., 2-9, fractions (2' 9 1/2", 2'-9-1/2", 3/4", 2 1/2'),
 * and an offset with a leading minus (-2' 6"). A bare number is feet. Returns
 * feet, or an error message.
 */
export function parseFeetInches(text: string): { readonly ft: number } | { readonly error: string } {
  const trimmed = text.trim()
  if (/^[-−]\s*[^-−\s]/.test(trimmed)) {
    const r = parseFeetInches(trimmed.replace(/^[-−]\s*/, ''))
    return 'ft' in r ? { ft: -r.ft } : r
  }
  const t = trimmed
    .toLowerCase()
    .replace(/[’′]/g, "'")
    .replace(/[”″]/g, '"')
    .replace(/(\d|\s)(?:feet|foot|ft)\.?/g, "$1'")
    .replace(/(\d|\s)(?:inches|inch|in)\.?/g, '$1"')
    .replace(/\s+/g, ' ')
  if (!t) return { error: 'Enter a length, such as 2\' 9" or 33 in' }
  // a whole or decimal number, a fraction, or a whole number and a fraction (9 1/2 or 9-1/2)
  const n = '((?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[ -]\\d+/\\d+)?|\\d+/\\d+)'
  const patterns: [RegExp, (m: RegExpMatchArray) => number][] = [
    [new RegExp(`^${n}$`), (m) => amount(m[1])],
    [new RegExp(`^${n} ?'$`), (m) => amount(m[1])],
    [new RegExp(`^${n} ?"$`), (m) => amount(m[1]) / 12],
    [new RegExp(`^${n} ?'(?: ?|-)${n} ?"?$`), (m) => amount(m[1]) + amount(m[2]) / 12],
    [new RegExp(`^(\\d+)-${n}$`), (m) => +m[1] + amount(m[2]) / 12],
  ]
  for (const [re, toFt] of patterns) {
    const m = t.match(re)
    if (!m) continue
    const ft = toFt(m)
    // a fraction over nothing, or a number too long to be a length
    return Number.isFinite(ft) ? { ft } : { error: `"${text.trim()}" is not a length a plan can hold` }
  }
  return { error: `"${text.trim()}" is not a length; try 2' 9", 9 1/2 in or 2.75` }
}

/** A number as written: 9.5, 3/4, 9 1/2 or 9-1/2; NaN for a fraction over zero. */
function amount(text: string): number {
  const m = text.match(/^(?:(\d+(?:\.\d+)?|\.\d+)[ -])?(\d+)\/(\d+)$/)
  if (!m) return +text
  const den = +m[3]
  return den === 0 ? NaN : (m[1] ? +m[1] : 0) + +m[2] / den
}

/** Feet as 2' 9" (to the nearest inch, or quarter inch below a foot); a dash for no number. */
export function formatFeetInches(ft: number): string {
  if (!Number.isFinite(ft)) return '—'
  const quarter = Math.abs(ft) < 1
  const inches = quarter ? Math.round(Math.abs(ft) * 48) / 4 : Math.round(Math.abs(ft) * 12)
  // the sign follows the rounded length, so a sliver below zero is 0", not -0"
  const sign = ft < 0 && inches > 0 ? '-' : ''
  const f = Math.floor(inches / 12)
  const i = inches - f * 12
  if (f === 0) return `${sign}${i}"`
  return i === 0 ? `${sign}${f}'` : `${sign}${f}' ${i}"`
}

const QUARTERS = ['', '1/4', '1/2', '3/4'] as const

/** Feet as a length field shows it: to the quarter inch at any length, as a builder writes it (2' 9 1/2", 3/4"). */
export function formatLengthField(ft: number): string {
  if (!Number.isFinite(ft)) return '—'
  const q = Math.round(Math.abs(ft) * 48)
  if (q === 0) return '0"'
  const sign = ft < 0 ? '-' : ''
  const f = Math.floor(q / 48)
  const rest = q - f * 48
  const whole = Math.floor(rest / 4)
  const frac = QUARTERS[rest % 4]
  const inches = frac ? (whole ? `${whole} ${frac}` : frac) : `${whole}`
  if (f === 0) return `${sign}${inches}"`
  return rest === 0 ? `${sign}${f}'` : `${sign}${f}' ${inches}"`
}

/** Snap feet to the nearest inch, the opening editor's step. */
export const snapInch = (ft: number): number => Math.round(ft * 12) / 12

/** Snap feet to the nearest quarter inch, the step a length field shows. */
export const snapQuarterInch = (ft: number): number => Math.round(ft * 48) / 48

/**
 * A typed length snapped to the quarter inch (what the field shows) and checked
 * against min and max (feet), so 30' 0.1" counts as the 30' it becomes.
 * Returns feet or an error message.
 */
export function readLength(text: string, min: number, max: number): { readonly ft: number } | { readonly error: string } {
  const r = parseFeetInches(text)
  if ('error' in r) return r
  const ft = snapQuarterInch(r.ft) || 0
  if (ft < min - 1e-9) return { error: `At least ${formatLengthField(min)}` }
  if (ft > max + 1e-9) return { error: `At most ${formatLengthField(max)}` }
  return { ft }
}
