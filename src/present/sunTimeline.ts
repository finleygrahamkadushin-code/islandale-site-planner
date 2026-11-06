/**
 * Present mode's sun animation (4D): from 7 am to golden hour (the Golden
 * hour view's 4:45 pm) in about 20 seconds. The hour it gives is a preview,
 * never the plan's saved time.
 */

export const START_HOUR = 7
export const GOLDEN_HOUR = 16.75
export const SUN_PLAY_S = 20
/** The sky reflection is rebuilt only on these steps (hours), not every frame. */
export const SKY_STEP_H = 0.5
/** With reduced motion, Play steps through these instead of sweeping. */
export const REDUCED_MOTION_HOURS: readonly number[] = [7, 9.5, 12, 14.5, GOLDEN_HOUR]
/** How long each reduced-motion step shows, seconds. */
export const REDUCED_STEP_S = 3

/** Gentle in and out, so the morning and golden hour linger a little. */
const ease = (t: number): number => t * t * (3 - 2 * t)

/** The preview hour `elapsedS` seconds into the animation. */
export function hourAt(elapsedS: number, reducedMotion = false): number {
  if (reducedMotion) {
    const i = Math.min(REDUCED_MOTION_HOURS.length - 1, Math.max(0, Math.floor(elapsedS / REDUCED_STEP_S)))
    return REDUCED_MOTION_HOURS[i]
  }
  const t = Math.min(1, Math.max(0, elapsedS / SUN_PLAY_S))
  return START_HOUR + (GOLDEN_HOUR - START_HOUR) * ease(t)
}

/** How long the animation runs before it stops by itself, seconds. */
export const playLength = (reducedMotion = false): number => (reducedMotion ? REDUCED_MOTION_HOURS.length * REDUCED_STEP_S : SUN_PLAY_S)

/** The hour the sky reflection uses: the preview hour rounded down to a half hour. */
export const skyHour = (hour: number): number => Math.floor(hour / SKY_STEP_H + 1e-9) * SKY_STEP_H

/** "2:30 pm" for 14.5. */
export function clockText(hour: number): string {
  const totalMin = Math.round(hour * 60)
  const h24 = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`
}
