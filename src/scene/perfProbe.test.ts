import { expect, test } from 'vitest'
import { frameStats } from './perfProbe'

test('frame stats give the median, the 95th percentile and the frame rate', () => {
  const s = frameStats([16, 17, 16, 18, 40, 16, 17, 16, 16, 17])
  expect(s.frames).toBe(10)
  expect(s.medianMs).toBe(17)
  expect(s.p95Ms).toBe(40)
  expect(s.fps).toBeCloseTo(1000 / 17, 6)
  expect(frameStats([])).toEqual({ frames: 0, medianMs: 0, p95Ms: 0, fps: 0 })
})
