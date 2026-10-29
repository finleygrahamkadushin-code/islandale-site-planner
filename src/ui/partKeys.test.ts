import { beforeEach, describe, expect, test } from 'vitest'
import { buildingMasses } from '../buildings/masses'
import { pickedPartOf, usePlanStore } from '../store/planStore'
import { MAIN_DELETE_TEXT, partKey } from './partKeys'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()
const PROW = 'C-0' // turned 35°; main, Porch 1, Stair 2, Deck 3, Porch 4
const key = (k: string, shiftKey = false) => partKey({ key: k, shiftKey }, usePlanStore.getState)
const mass = (mi: number) => buildingMasses(store().plan.objects[PROW].params)[mi]

describe('part keys', () => {
  beforeEach(() => {
    store().setReadOnly(null)
    store().loadScheme('C')
    store().lockAll(false)
    history().clear()
  })

  test('nothing picked: the keys are the selection’s', () => {
    store().select([PROW])
    expect(key('Escape')).toBe(false)
    expect(key('ArrowUp')).toBe(false)
  })

  test('Escape drops the part and keeps the building selected', () => {
    store().pickPart({ objectId: PROW, mass: 3 })
    expect(key('Escape')).toBe(true)
    expect(pickedPartOf(store())).toBeNull()
    expect(store().selection).toEqual([PROW])
  })

  test('Delete removes a wing as one step; the main walls only say how', () => {
    store().pickPart({ objectId: PROW, mass: 3 })
    expect(key('Delete')).toBe(true)
    expect(buildingMasses(store().plan.objects[PROW].params)).toHaveLength(4)
    expect(store().toast?.text).toBe('Removed Deck 3')
    expect(history().pastStates).toHaveLength(1)
    store().pickPart({ objectId: PROW, mass: 0 })
    expect(key('Backspace')).toBe(true)
    expect(store().toast?.text).toBe(MAIN_DELETE_TEXT)
    expect(history().pastStates).toHaveLength(1)
  })

  test('arrows nudge a wing a foot east or north (5 ft with Shift), turned into the building frame', () => {
    store().pickPart({ objectId: PROW, mass: 3 })
    const { dx, dz } = mass(3)
    expect(key('ArrowRight')).toBe(true)
    const a = (35 * Math.PI) / 180
    expect(mass(3).dx).toBeCloseTo(dx + Math.cos(a), 3)
    expect(mass(3).dz).toBeCloseTo(dz + Math.sin(a), 3)
    expect(key('ArrowUp', true)).toBe(true)
    expect(history().pastStates).toHaveLength(2)
  })

  test('Q, E and R turn a wing; arrows on the main walls move the whole building instead', () => {
    store().pickPart({ objectId: PROW, mass: 1 })
    key('e')
    key('R')
    expect(mass(1).rot).toBe(95)
    store().pickPart({ objectId: PROW, mass: 0 })
    expect(key('ArrowLeft')).toBe(false)
  })

  test('a locked building refuses with its toast and stays as it was', () => {
    store().setLocked(PROW, true)
    store().pickPart({ objectId: PROW, mass: 3 })
    history().clear()
    const before = store().plan
    key('Delete')
    key('ArrowDown')
    expect(store().plan).toBe(before)
    expect(store().toast?.text).toMatch(/locked/)
  })
})
