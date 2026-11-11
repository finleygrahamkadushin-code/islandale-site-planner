/**
 * How the orbit's coast after a drag ends (R8, found in the R8.1 check).
 *
 * OrbitControls damps by a fixed share of the leftover motion per frame, so
 * its coast lasts about 120 frames whatever the frame rate: 2 s at 60 fps, a
 * minute on a slow machine. These turn the share into a rate per second (the
 * same 0.05 at 60 fps), and tell when what is left of the coast is too small
 * to see, so the view can finish it in one step and stop drawing.
 */

/** OrbitControls' damping factor, as tuned at 60 frames a second. */
export const BASE_DAMPING = 0.05
const REFERENCE_FPS = 60
/** A gap longer than this between frames is the view resting, not a slow frame. */
export const IDLE_GAP_S = 0.75
/** The longest frame the damping is worked out for, so one step never takes nearly all the coast. */
export const MAX_STEP_S = 0.5
/** What is left of a coast under this many pixels is finished in one step. */
export const SETTLE_PX = 1

/** The damping factor that coasts as far in `stepS` seconds as BASE_DAMPING does in 1/60 s. */
export function dampingFor(stepS: number): number {
  const step = Math.min(MAX_STEP_S, Math.max(0, stepS))
  return 1 - (1 - BASE_DAMPING) ** (step * REFERENCE_FPS)
}

/**
 * The frame time to damp by: the gap since the last frame, or, after the view
 * has been resting, the last real frame time (the first frame after a rest
 * has a gap of seconds, which would end a fresh drag's ease at once).
 */
export function frameStep(gapS: number, lastStepS: number): number {
  return gapS > IDLE_GAP_S ? lastStepS : gapS
}

/** Pixels on screen for a turn of `angleRad` and a move of `moveM` at `distanceM` from the camera. */
export function screenPx(angleRad: number, moveM: number, distanceM: number, fovDeg: number, heightPx: number): number {
  const fovRad = (fovDeg * Math.PI) / 180
  return ((Math.abs(angleRad) + Math.abs(moveM) / Math.max(distanceM, 1e-6)) * heightPx) / fovRad
}

/** What is left of a coast, in pixels, after a frame that moved `movedPx` with damping `factor` (each frame takes that share of what is left). */
export function leftoverPx(movedPx: number, factor: number): number {
  return factor > 0 ? (movedPx * (1 - factor)) / factor : Number.POSITIVE_INFINITY
}
