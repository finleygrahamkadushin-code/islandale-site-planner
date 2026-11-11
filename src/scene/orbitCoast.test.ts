import { expect, test } from 'vitest'
import { BASE_DAMPING, dampingFor, frameStep, IDLE_GAP_S, leftoverPx, MAX_STEP_S, screenPx, SETTLE_PX } from './orbitCoast'

/** Frames until a coast of `startPx` is left with under SETTLE_PX, stepping `stepS` seconds a frame. */
function framesToSettle(startPx: number, stepS: number): number {
  const f = dampingFor(stepS)
  let left = startPx
  let frames = 0
  while (left >= SETTLE_PX) {
    left *= 1 - f
    frames++
  }
  return frames
}

test('at 60 fps the damping is OrbitControls’ own 0.05', () => {
  expect(dampingFor(1 / 60)).toBeCloseTo(BASE_DAMPING, 12)
})

test('the coast takes the same time at any frame rate, not the same number of frames', () => {
  const at60 = framesToSettle(200, 1 / 60) / 60
  const at30 = framesToSettle(200, 1 / 30) / 30
  const at2 = framesToSettle(200, 0.4) / 2.5
  expect(at30).toBeCloseTo(at60, 1)
  // a very slow frame is damped as MAX_STEP_S at most, so it can't take nearly all the coast in one step
  expect(dampingFor(5)).toBe(dampingFor(MAX_STEP_S))
  expect(dampingFor(5)).toBeLessThan(0.95)
  expect(at2).toBeLessThan(at60 * 1.5)
})

test('after a rest the step is the last real frame time, not the gap', () => {
  expect(frameStep(0.4, 1 / 60)).toBe(0.4)
  expect(frameStep(IDLE_GAP_S + 2, 0.4)).toBe(0.4)
  expect(frameStep(30, 1 / 60)).toBe(1 / 60)
})

test('screen pixels for a turn and a slide, and what is left of a coast', () => {
  // a 45° view 900 px high: 1° is 20 px
  expect(screenPx((1 * Math.PI) / 180, 0, 10, 45, 900)).toBeCloseTo(20, 6)
  // sliding 1 m at 10 m is about 1/10 rad
  expect(screenPx(0, 1, 10, 45, 900)).toBeCloseTo(0.1 * (900 / (Math.PI / 4)), 6)
  // each frame takes 5 %: a frame that moved 1 px leaves 19 px to come
  expect(leftoverPx(1, 0.05)).toBeCloseTo(19, 9)
  expect(leftoverPx(1, 0)).toBe(Number.POSITIVE_INFINITY)
})
