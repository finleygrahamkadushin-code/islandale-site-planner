/**
 * The sky's look by the sun's height (4E): warmer and hazier as the sun gets
 * low, and the horizon colour the fog fades to, so distant water over Mud
 * Bay melts into the sky instead of into grey. Realistic style only.
 */

export interface SkyLook {
  readonly turbidity: number
  readonly rayleigh: number
  readonly mieCoefficient: number
  /** The colour at the horizon, for the fog and the background. */
  readonly horizon: string
  /** 0 at midday, 1 with the sun at the horizon. */
  readonly warmth: number
}

const NOON_HORIZON = [0.83, 0.87, 0.9] as const
const LOW_SUN_HORIZON = [0.95, 0.78, 0.6] as const
/** Below this sun height, degrees, the light starts to warm. */
const WARM_FROM_DEG = 25

const hex = (c: readonly number[]): string => `#${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`

export function skyLook(sunElevationDeg: number): SkyLook {
  const t = Math.max(0, Math.min(1, 1 - sunElevationDeg / WARM_FROM_DEG))
  const warmth = t * t * (3 - 2 * t)
  const horizon = NOON_HORIZON.map((v, i) => v + (LOW_SUN_HORIZON[i] - v) * warmth)
  return { turbidity: 6 + 4 * warmth, rayleigh: 1.6 + 1.4 * warmth, mieCoefficient: 0.004 + 0.006 * warmth, horizon: hex(horizon), warmth }
}
