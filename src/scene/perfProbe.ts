import { invalidate } from '@react-three/fiber'

/**
 * Speed probes (4E), for tests and the console: when the first frame was
 * drawn, and frame times sampled over a stretch (say, during a drag).
 */

let firstFrameAt: number | null = null

/** Note the first drawn frame, milliseconds since the page started loading. */
export function markFirstFrame(): void {
  if (firstFrameAt === null) firstFrameAt = performance.now()
}

export const firstFrameMs = (): number | null => firstFrameAt

export interface FrameStats {
  readonly frames: number
  readonly medianMs: number
  readonly p95Ms: number
  readonly fps: number
}

/** Frame times as a summary: median, 95th percentile and the frame rate the median gives. */
export function frameStats(deltas: readonly number[]): FrameStats {
  if (!deltas.length) return { frames: 0, medianMs: 0, p95Ms: 0, fps: 0 }
  const sorted = [...deltas].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  const medianMs = at(0.5)
  return { frames: sorted.length, medianMs, p95Ms: at(0.95), fps: medianMs > 0 ? 1000 / medianMs : 0 }
}

/**
 * Sample animation frames for `ms` milliseconds. The view draws only on
 * demand (R8.1), so every sampled frame asks for a draw: the times are what
 * drawing the scene costs, as they were when it drew every frame.
 */
export function sampleFrames(ms: number): Promise<FrameStats> {
  return new Promise((resolve) => {
    const deltas: number[] = []
    const start = performance.now()
    let last = start
    const tick = (now: number) => {
      deltas.push(now - last)
      last = now
      if (now - start < ms) {
        invalidate()
        requestAnimationFrame(tick)
      } else resolve(frameStats(deltas.slice(1)))
    }
    invalidate()
    requestAnimationFrame(tick)
  })
}
