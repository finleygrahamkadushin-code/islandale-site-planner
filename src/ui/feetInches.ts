/**
 * Lengths typed the way a builder writes them: 2' 9", 2'9, 33in, 33", 2.75,
 * 2 ft 9 in, 2-9. A bare number is feet. Returns feet, or an error message.
 */
export function parseFeetInches(text: string): { readonly ft: number } | { readonly error: string } {
  const t = text.trim().toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/\s+/g, ' ')
  if (!t) return { error: 'Enter a length, such as 2\' 9" or 33 in' }
  const n = '(\\d+(?:\\.\\d+)?|\\.\\d+)'
  const patterns: [RegExp, (m: RegExpMatchArray) => number][] = [
    [new RegExp(`^${n}$`), (m) => +m[1]],
    [new RegExp(`^${n} ?(?:'|ft|feet|foot)$`), (m) => +m[1]],
    [new RegExp(`^${n} ?(?:"|in|inch|inches)$`), (m) => +m[1] / 12],
    [new RegExp(`^${n} ?(?:'|ft|feet|foot)(?: ?|-)${n} ?(?:"|in|inch|inches)?$`), (m) => +m[1] + +m[2] / 12],
    [new RegExp(`^(\\d+)-${n}$`), (m) => +m[1] + +m[2] / 12],
  ]
  for (const [re, toFt] of patterns) {
    const m = t.match(re)
    if (m) return { ft: toFt(m) }
  }
  return { error: `"${text.trim()}" is not a length; try 2' 9", 33 in or 2.75` }
}

/** Feet as 2' 9" (to the nearest inch, or quarter inch below a foot). */
export function formatFeetInches(ft: number): string {
  const sign = ft < 0 ? '-' : ''
  const quarter = Math.abs(ft) < 1
  const inches = quarter ? Math.round(Math.abs(ft) * 48) / 4 : Math.round(Math.abs(ft) * 12)
  const f = Math.floor(inches / 12)
  const i = inches - f * 12
  if (f === 0) return `${sign}${i}"`
  return i === 0 ? `${sign}${f}'` : `${sign}${f}' ${i}"`
}

/** Snap feet to the nearest inch, the opening editor's step. */
export const snapInch = (ft: number): number => Math.round(ft * 12) / 12
