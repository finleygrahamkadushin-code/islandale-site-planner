/**
 * Sun position for Islandale, ported from the legacy planner's updateSun():
 * latitude 48.46°, declination by season. The hour is clock time (review
 * R2.6, decision 4): Pacific time, with daylight saving in June and
 * September, the site's longitude and the equation of time for each
 * season's day. The old planner fixed solar noon at 12:18 all year, so a
 * June afternoon sun was drawn about 16° too far west and 8° too low.
 */
import type { SeasonId } from '../../store/types'

export type Season = SeasonId

export const SEASONS: readonly { readonly id: Season; readonly label: string }[] = [
  { id: 'jun', label: 'June' },
  { id: 'sep', label: 'September' },
  { id: 'dec', label: 'December' },
]

const LATITUDE_DEG = 48.46
/** Islandale, south Lopez Island, degrees east (negative west). */
const LONGITUDE_DEG = -122.88
/** Pacific Standard Time's meridian, degrees east. */
const ZONE_MERIDIAN_DEG = -120
const DECLINATION_DEG: Readonly<Record<Season, number>> = { jun: 23.44, sep: 0, dec: -23.44 }
/** The day each season stands for: the June solstice, the September equinox, the December solstice (day of the year). */
const SEASON_DAY: Readonly<Record<Season, number>> = { jun: 172, sep: 265, dec: 355 }
/** Clocks are an hour ahead of standard time (Pacific daylight time) on these days. */
const DAYLIGHT_SAVING: Readonly<Record<Season, boolean>> = { jun: true, sep: true, dec: false }

/** Equation of time, minutes the sundial runs ahead of mean time (the usual three-term approximation, within about a minute). */
function equationOfTimeMin(day: number): number {
  const B = (2 * Math.PI * (day - 81)) / 364
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)
}

/** The clock the hour is read on: Pacific daylight time in June and September, standard time in December. */
export const clockZone = (season: Season): 'PDT' | 'PST' => (DAYLIGHT_SAVING[season] ? 'PDT' : 'PST')

/** The clock time the sun is due south at Islandale in a season, hours. */
export function solarNoonHour(season: Season): number {
  const longitudeMin = (ZONE_MERIDIAN_DEG - LONGITUDE_DEG) * 4
  const dst = DAYLIGHT_SAVING[season] ? 60 : 0
  return 12 + (longitudeMin - equationOfTimeMin(SEASON_DAY[season]) + dst) / 60
}

export interface SunPosition {
  /** Degrees clockwise from north: 90 east, 180 south, 270 west. */
  readonly azimuthDeg: number
  /** Degrees above the horizon; negative below it. */
  readonly elevationDeg: number
  /** Unit vector toward the sun in the site frame: x east, n north, up. */
  readonly direction: readonly [x: number, n: number, up: number]
}

/** Where the sun is at a clock hour in a season. */
export function sunPosition(season: Season, hour: number): SunPosition {
  const lat = (LATITUDE_DEG * Math.PI) / 180
  const decl = (DECLINATION_DEG[season] * Math.PI) / 180
  const H = ((hour - solarNoonHour(season)) * 15 * Math.PI) / 180
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
