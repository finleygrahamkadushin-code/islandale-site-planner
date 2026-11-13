import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { toolOf } from '../store/toolActions'
import { ftToM } from '../site/units'
import { setViewCentreSource } from '../scene/cameraFocus'
import { useAnnounce } from '../ui/announce'
import { arrowStep } from './arrowSteps'
import { placeKey, startPlacingAtView } from './keyboardPlace'
import { toolKey } from './toolKeys'

/** R10.1: placing from the keyboard, with the arrows meaning the same as the selection's nudge. */
const store = () => usePlanStore.getState()
const steps = () => usePlanStore.temporal.getState().pastStates.length
const said = () => useAnnounce.getState().text
const key = (k: string, shiftKey = false) => ({ key: k, shiftKey })
const FT = ftToM(1)

describe('arrow keys (R10.1)', () => {
  test('follow the compass, not the screen: up is north, right is east; 1 ft, Shift 5 ft', () => {
    expect(arrowStep(key('ArrowUp'))).toEqual([0, FT])
    expect(arrowStep(key('ArrowDown'))).toEqual([0, -FT])
    expect(arrowStep(key('ArrowRight'))).toEqual([FT, 0])
    expect(arrowStep(key('ArrowLeft', true))).toEqual([-5 * FT, 0])
    expect(arrowStep(key('a'))).toBeNull()
  })
})

describe('placing from the keyboard (R10.1)', () => {
  beforeEach(() => {
    store().loadScheme('C')
    store().lockAll(false)
    store().setTool('select')
    store().setSnap(true)
    usePlanStore.temporal.getState().clear()
    setViewCentreSource(() => ({ x: ftToM(10.4), n: ftToM(-20.2) }))
  })
  afterEach(() => setViewCentreSource(null))

  test('starting puts the ghost where the view looks, on the grid, and says how to go on', () => {
    startPlacingAtView('guest-cabin')
    expect(toolOf(store())).toBe('place')
    expect(store().placing?.at?.x).toBeCloseTo(ftToM(10), 6)
    expect(store().placing?.at?.n).toBeCloseTo(ftToM(-20), 6)
    expect(said()).toMatch(/^Placing Guest cabin at East 10', North -20'/)
    expect(said()).toMatch(/Enter puts it down/)
  })

  test('arrows move the ghost as they nudge a selection; Q / E / R still turn it; nothing is an undo step', () => {
    startPlacingAtView('guest-cabin')
    expect(placeKey(key('ArrowUp'), store())).toBe(true)
    expect(placeKey(key('ArrowRight', true), store())).toBe(true)
    expect(store().placing?.at?.x).toBeCloseTo(ftToM(15), 6)
    expect(store().placing?.at?.n).toBeCloseTo(ftToM(-19), 6)
    expect(said()).toBe("Ghost at East 15', North -19'")
    expect(toolKey(key('r'), store())).toBe(true)
    expect(store().placing?.rotation).toBe(90)
    expect(steps()).toBe(0)
  })

  test('Enter puts it down as one undo step, selected, and says so', () => {
    startPlacingAtView('guest-cabin')
    const before = store().plan.order.length
    expect(placeKey(key('Enter'), store())).toBe(true)
    expect(store().plan.order.length).toBe(before + 1)
    const id = store().selection[0]
    expect(store().plan.objects[id].name).toMatch(/Guest cabin/)
    expect(toolOf(store())).toBe('select')
    expect(steps()).toBe(1)
    expect(said()).toMatch(/^Placed Guest cabin.* at East 10', North -20'/)
  })

  test("a locked layer refuses with the pointer user's toast, and placing stays on", () => {
    store().lockAll(true)
    startPlacingAtView('guest-cabin')
    expect(placeKey(key('Enter'), store())).toBe(true)
    expect(store().toast?.text).toMatch(/locked/i)
    expect(toolOf(store())).toBe('place')
    expect(steps()).toBe(0)
  })

  test('Escape stops placing and says so', () => {
    startPlacingAtView('guest-cabin')
    expect(toolKey(key('Escape'), store())).toBe(true)
    expect(toolOf(store())).toBe('select')
    expect(said()).toBe('Placing stopped')
  })

  test('with no view to read (no camera yet), arrows start the ghost from the site origin', () => {
    setViewCentreSource(null)
    store().setTool('place', 'guest-cabin')
    expect(placeKey(key('ArrowUp'), store())).toBe(true)
    expect(store().placing?.at?.n).toBeCloseTo(FT, 6)
  })
})
