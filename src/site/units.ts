// Internal units are metres and NAVD88 metres; the UI shows feet and inches.
export const FT_PER_M = 1 / 0.3048
export const M_PER_FT = 0.3048
export const SQFT_PER_SQM = FT_PER_M * FT_PER_M
export const SQFT_PER_ACRE = 43560

export const ftToM = (ft: number): number => ft * M_PER_FT
export const mToFt = (m: number): number => m * FT_PER_M
export const sqMToSqFt = (m2: number): number => m2 * SQFT_PER_SQM
export const sqFtToAcres = (sqft: number): number => sqft / SQFT_PER_ACRE

/** Degrees normalised to (-180, 180], the way every rotation in the plan is stored. */
export function normalizeDeg(deg: number): number {
  const d = ((deg % 360) + 360) % 360
  return d > 180 ? d - 360 : d
}
