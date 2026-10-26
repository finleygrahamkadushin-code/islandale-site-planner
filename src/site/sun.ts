/**
 * Sun position for Islandale, ported from the legacy planner's updateSun():
 * latitude 48.46°, solar noon at 12:18 local, declination by season.
 */
import type { SeasonId } from '../store/types'

export type Season = SeasonId

export const SEASONS: readonly { readonly id: Season; readonly label: string }[] = [
  { id: 'jun', label: 'June' },
  { id: 'sep', label: 'September' },
  { id: 'dec', label: 'December' },
]

const LATITUDE_DEG = 48.46
const SOLAR_NOON_HOUR = 12.3
const DECLINATION_DEG: Readonly<Record<Season, number>> = { jun: 23.44, sep: 0, dec: -23.44 }

export interface SunPosition {
  /** Degrees clockwise from north: 90 east, 180 south, 270 west. */
  readonly azimuthDeg: number
  /** Degrees above the horizon; negative below it. */
  readonly elevationDeg: number
  /** Unit vector toward the sun in the site frame: x east, n north, up. */
  readonly direction: readonly [x: number, n: number, up: number]
}

export function sunPosition(season: Season, hour: number): SunPosition {
  const lat = (LATITUDE_DEG * Math.PI) / 180
  const decl = (DECLINATION_DEG[season] * Math.PI) / 180
  const H = ((hour - SOLAR_NOON_HOUR) * 15 * Math.PI) / 180
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H)
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)))
  const cosAz = (Math.sin(decl) - Math.sin(lat) * sinEl) / (Math.cos(lat) * Math.cos(el))
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)))
  if (H > 0) az = 2 * Math.PI - az
  return {
    azimuthDeg: (az * 180) / Math.PI,
    elevationDeg: (el * 180) / Math.PI,
    direction: [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el)],
  }
}
