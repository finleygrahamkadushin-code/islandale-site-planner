/**
 * The compass and scale bar (4D): pure maths from the camera. Site frame:
 * three.js x is east and -z is north.
 */

const FT_PER_M = 1 / 0.3048
/** Round lengths the scale bar may show, feet. */
export const SCALE_LENGTHS_FT: readonly number[] = [5, 10, 20, 50, 100, 200, 500]
/** The longest the bar should be on screen, pixels. */
export const SCALE_MAX_PX = 140

/** Ground metres per screen pixel at `distanceM` from a perspective camera. */
export function metresPerPixel(distanceM: number, fovDeg: number, viewHeightPx: number): number {
  return (2 * distanceM * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, viewHeightPx)
}

/** The longest round length that fits in `SCALE_MAX_PX`, and its width in pixels. */
export function scaleBar(mPerPx: number): { readonly ft: number; readonly px: number } {
  const ftPerPx = mPerPx * FT_PER_M
  const fits = SCALE_LENGTHS_FT.filter((ft) => ft / ftPerPx <= SCALE_MAX_PX)
  const ft = fits.length ? fits[fits.length - 1] : SCALE_LENGTHS_FT[0]
  return { ft, px: ft / ftPerPx }
}

/**
 * The camera's heading in degrees clockwise from north, from the direction it
 * looks along (three.js x and z). Looking north (-z) is 0, east (+x) is 90.
 */
export function headingDeg(lookX: number, lookZ: number): number {
  if (Math.abs(lookX) < 1e-9 && Math.abs(lookZ) < 1e-9) return 0
  const deg = (Math.atan2(lookX, -lookZ) * 180) / Math.PI
  return (deg + 360) % 360
}

/** True when the camera looks almost straight down, so the scale is exact on the ground. */
export const looksStraightDown = (lookY: number): boolean => lookY < -0.995

/**
 * Where the camera goes to face north: due south of the target, keeping its
 * height above the target and its distance along the ground.
 */
export function facingNorth(camera: readonly [number, number, number], target: readonly [number, number, number]): [number, number, number] {
  const [cx, cy, cz] = camera
  const [tx, , tz] = target
  const flat = Math.max(0.01, Math.hypot(cx - tx, cz - tz))
  return [tx, cy, tz + flat]
}
