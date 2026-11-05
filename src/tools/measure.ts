/**
 * The Measure tool's maths (4B, old planner measure): two picked points in
 * the site frame, metres (x east, n north, z elevation NAVD88), give the
 * horizontal distance, the slope distance and the rise from the first to
 * the second. Measurements are view state: never saved, never undone.
 */

export interface MeasurePoint {
  readonly x: number
  readonly n: number
  readonly z: number
}

export interface Measurement {
  readonly a: MeasurePoint
  readonly b: MeasurePoint
  readonly horizontalM: number
  readonly slopeM: number
  /** From a to b: positive when b is higher. */
  readonly riseM: number
}

/** The last measurements kept on screen until Clear. */
export const MAX_MEASUREMENTS = 5

export function measureOf(a: MeasurePoint, b: MeasurePoint): Measurement {
  const horizontalM = Math.hypot(b.x - a.x, b.n - a.n)
  const riseM = b.z - a.z
  return { a, b, horizontalM, riseM, slopeM: Math.hypot(horizontalM, riseM) }
}

/** The measurements with one more, keeping only the last MAX_MEASUREMENTS. */
export function withMeasurement(list: readonly Measurement[], m: Measurement): Measurement[] {
  return [...list, m].slice(-MAX_MEASUREMENTS)
}
