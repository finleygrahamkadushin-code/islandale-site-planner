/** 12'-6" (old INT.model.fmtLen), from feet. */
export function fmtLen(ft: number): string {
  if (!Number.isFinite(ft)) return ''
  const tot = Math.round(Math.abs(ft) * 12)
  const sign = ft < 0 && tot > 0 ? '-' : ''
  return `${sign}${Math.floor(tot / 12)}'-${tot % 12}"`
}

/** 140 sf, from square feet. */
export const fmtArea = (sf: number): string => `${Math.round(Number.isFinite(sf) ? sf : 0)} sf`
