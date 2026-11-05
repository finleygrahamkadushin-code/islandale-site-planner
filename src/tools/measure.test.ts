import { beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { toolOf } from '../store/toolActions'
import { MAX_MEASUREMENTS, measureOf } from './measure'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()

describe('measuring (4B)', () => {
  test('horizontal, slope and rise between two points (metres in, metres out)', () => {
    const m = measureOf({ x: 0, n: 0, z: 10 }, { x: 3, n: 4, z: 13 })
    expect(m.horizontalM).toBeCloseTo(5, 10)
    expect(m.riseM).toBeCloseTo(3, 10)
    expect(m.slopeM).toBeCloseTo(Math.hypot(5, 3), 10)
    expect(measureOf({ x: 1, n: 1, z: 5 }, { x: 1, n: 1, z: 2 }).riseM).toBeCloseTo(-3, 10)
  })

  describe('the Measure tool', () => {
    beforeEach(() => {
      store().loadScheme('C')
      store().setTool('select')
      store().clearMeasurements()
      history().clear()
    })

    test('is one of the tools, and ends the others', () => {
      store().setTool('paint')
      store().setTool('measure')
      expect(toolOf(store())).toBe('measure')
      expect(store().painting).toBe(false)
      store().setTool('place', 'shed')
      expect(store().measuring).toBeNull()
    })

    test('two clicks make a measurement; the last five are kept; none is an undo step', () => {
      store().setTool('measure')
      for (let i = 0; i < MAX_MEASUREMENTS + 2; i++) {
        store().measurePoint({ x: i, n: 0, z: 0 })
        expect(store().measuring?.a).toEqual({ x: i, n: 0, z: 0 })
        store().measurePoint({ x: i, n: 10, z: 0 })
        expect(store().measuring?.a).toBeNull()
      }
      expect(store().measurements).toHaveLength(MAX_MEASUREMENTS)
      expect(store().measurements.at(-1)?.a.x).toBe(MAX_MEASUREMENTS + 1)
      expect(history().pastStates).toHaveLength(0)
    })

    test('Escape drops the one in progress; Clear drops them all; both stay after the tool ends', () => {
      store().setTool('measure')
      store().measurePoint({ x: 0, n: 0, z: 0 })
      store().measurePoint({ x: 5, n: 0, z: 0 })
      store().measurePoint({ x: 9, n: 9, z: 0 })
      store().dropMeasurePoint()
      expect(store().measuring?.a).toBeNull()
      store().setTool('select')
      expect(store().measurements).toHaveLength(1)
      store().clearMeasurements()
      expect(store().measurements).toHaveLength(0)
    })
  })
})
