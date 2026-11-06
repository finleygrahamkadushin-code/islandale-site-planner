import { beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { toolOf } from '../store/toolActions'
import { usePresent } from './present'
import { clockText, GOLDEN_HOUR, hourAt, playLength, REDUCED_MOTION_HOURS, skyHour, START_HOUR, SUN_PLAY_S } from './sunTimeline'
import { facingNorth, headingDeg, looksStraightDown, metresPerPixel, scaleBar, SCALE_MAX_PX } from './viewMaths'
import { snapshotName } from './snapshot'
import { hasWebGL2 } from './webgl'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()

describe('Present mode (4D)', () => {
  beforeEach(() => {
    usePresent.getState().leave()
    store().loadScheme('C')
    store().setLabelMode('all')
    history().clear()
  })

  test('entering turns labels off and ends any tool; leaving puts labels back; neither is an undo step', () => {
    store().setTool('measure')
    usePresent.getState().enter()
    expect(usePresent.getState().presenting).toBe(true)
    expect(store().labelMode).toBe('none')
    expect(toolOf(store())).toBe('select')
    usePresent.getState().leave()
    expect(usePresent.getState().presenting).toBe(false)
    expect(store().labelMode).toBe('all')
    expect(history().pastStates.length).toBe(0)
  })

  test('the selection survives presenting', () => {
    const id = store().plan.order[0]
    store().select([id])
    usePresent.getState().enter()
    usePresent.getState().leave()
    expect(store().selection).toEqual([id])
  })

  test('the sun animation is a preview: the plan’s saved hour never changes', () => {
    const hour = store().environment.hour
    usePresent.getState().enter()
    usePresent.getState().play()
    expect(usePresent.getState().previewHour).toBe(START_HOUR)
    usePresent.getState().setPreviewHour(12)
    usePresent.getState().pause()
    expect(store().environment.hour).toBe(hour)
    usePresent.getState().leave()
    expect(usePresent.getState().previewHour).toBeNull()
    expect(usePresent.getState().playing).toBe(false)
    expect(store().environment.hour).toBe(hour)
  })

  test('leaving turns the orbit off', () => {
    usePresent.getState().enter()
    usePresent.getState().setOrbit(true)
    usePresent.getState().leave()
    expect(usePresent.getState().orbit).toBe(false)
  })
})

describe('sun timeline (4D)', () => {
  test('runs from 7 am to golden hour, in order', () => {
    expect(hourAt(0)).toBe(START_HOUR)
    expect(hourAt(SUN_PLAY_S)).toBeCloseTo(GOLDEN_HOUR, 9)
    expect(hourAt(SUN_PLAY_S + 5)).toBeCloseTo(GOLDEN_HOUR, 9)
    let last = -Infinity
    for (let t = 0; t <= SUN_PLAY_S; t += 0.5) {
      const h = hourAt(t)
      expect(h).toBeGreaterThanOrEqual(last)
      last = h
    }
    expect(GOLDEN_HOUR).toBe(16.75)
  })

  test('with reduced motion it steps through five fixed times', () => {
    const seen = new Set<number>()
    for (let t = 0; t < playLength(true); t += 0.25) seen.add(hourAt(t, true))
    expect([...seen]).toEqual([...REDUCED_MOTION_HOURS])
    expect(REDUCED_MOTION_HOURS.at(-1)).toBe(GOLDEN_HOUR)
  })

  test('the sky only steps every half hour', () => {
    expect(skyHour(7)).toBe(7)
    expect(skyHour(7.49)).toBe(7)
    expect(skyHour(7.5)).toBe(7.5)
    expect(skyHour(16.75)).toBe(16.5)
  })

  test('clock text', () => {
    expect(clockText(7)).toBe('7:00 am')
    expect(clockText(14.5)).toBe('2:30 pm')
    expect(clockText(16.75)).toBe('4:45 pm')
    expect(clockText(12)).toBe('12:00 pm')
  })
})

describe('compass and scale bar (4D)', () => {
  test('metres per pixel from the camera', () => {
    // 90° field of view: the view is 2 × distance tall
    expect(metresPerPixel(50, 90, 1000)).toBeCloseTo(0.1, 9)
  })

  test('the scale bar picks the longest round length that fits', () => {
    const { ft, px } = scaleBar(0.1) // 0.328 ft per px: 140 px is 46 ft
    expect(ft).toBe(20)
    expect(px).toBeCloseTo(20 / (0.1 / 0.3048), 6)
    expect(px).toBeLessThanOrEqual(SCALE_MAX_PX)
    expect(scaleBar(0.001).ft).toBe(5)
  })

  test('heading: north is 0, east 90, south 180, west 270', () => {
    expect(headingDeg(0, -1)).toBeCloseTo(0, 9)
    expect(headingDeg(1, 0)).toBeCloseTo(90, 9)
    expect(headingDeg(0, 1)).toBeCloseTo(180, 9)
    expect(headingDeg(-1, 0)).toBeCloseTo(270, 9)
  })

  test('straight down is exact; facing north puts the camera due south of the target', () => {
    expect(looksStraightDown(-1)).toBe(true)
    expect(looksStraightDown(-0.7)).toBe(false)
    const to = facingNorth([30, 20, -40], [0, 2, 0])
    expect(to[0]).toBe(0)
    expect(to[1]).toBe(20)
    expect(to[2]).toBeCloseTo(50, 9)
    expect(headingDeg(0 - to[0], 0 - to[2])).toBeCloseTo(0, 9)
  })
})

describe('snapshot and WebGL (4D)', () => {
  test('the file is named after the view and the date', () => {
    expect(snapshotName('Golden hour', new Date(2026, 10, 5))).toBe('islandale-golden-hour-2026-11-05.png')
    expect(snapshotName('Plan (top)', new Date(2026, 0, 9))).toBe('islandale-plan-top-2026-01-09.png')
    expect(snapshotName(null, new Date(2026, 0, 9))).toBe('islandale-view-2026-01-09.png')
  })

  test('no WebGL 2 means no 3D view', () => {
    expect(hasWebGL2(() => ({ getContext: () => null }))).toBe(false)
    expect(hasWebGL2(() => ({ getContext: () => ({}) }))).toBe(true)
    expect(
      hasWebGL2(() => {
        throw new Error('no canvas')
      }),
    ).toBe(false)
  })
})
