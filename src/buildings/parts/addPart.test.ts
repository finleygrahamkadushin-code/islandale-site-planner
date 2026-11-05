import { beforeEach, describe, expect, test } from 'vitest'
import { ACCESS_HOST_TEXT } from './attach'
import { buildingMasses } from '../masses'
import { pickedPartOf, usePlanStore } from '../../store/planStore'
import { addPartAt } from './addPart'
import type { PartFrame } from './partFrame'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()
const POD = 'C-2' // a rect main mass (19 × 11.5 ft), Porch 1, Stair 2, Porch 3
/** The pod over level ground 1 m below its floor. */
const frame = (): PartFrame => ({ masses: buildingMasses(store().plan.objects[POD].params), standalone: false, base: 5, site: { floor: 5, groundAt: () => 4 } })

describe('addPartAt', () => {
  beforeEach(() => {
    store().setReadOnly(null)
    store().loadScheme('C')
    store().lockAll(false)
    history().clear()
  })

  test('a deck off a free edge is one undo step, becomes the picked part and says what was added', () => {
    const before = store().plan
    addPartAt(POD, frame(), 0, 3, 'deck')
    const masses = buildingMasses(store().plan.objects[POD].params)
    expect(masses).toHaveLength(5)
    expect(masses[4]).toMatchObject({ kind: 'deck', w: 12, d: 10, rot: -90 })
    expect(pickedPartOf(store())).toEqual({ objectId: POD, mass: 4 })
    expect(store().selection).toEqual([POD])
    expect(store().toast?.text).toBe('Added Deck · 12 × 10 ft off Main left · Undo to remove')
    expect(history().pastStates).toHaveLength(1)
    history().undo()
    expect(store().plan).toBe(before)
    expect(pickedPartOf(store())).toBeNull()
  })

  test('a door goes on the wall through the openings code', () => {
    // every wall of the pod is full of windows already
    addPartAt(POD, frame(), 0, 0, 'door')
    expect(store().toast?.text).toBe('No room for a door on that wall')
    store().setObjectParams(POD, { cuts: [] })
    history().clear()
    addPartAt(POD, frame(), 0, 0, 'door')
    const cuts = buildingMasses(store().plan.objects[POD].params)[0].cuts
    expect(cuts).toEqual([expect.objectContaining({ kind: 'door', edge: 0, x: 8, w: 3, sill: 0 })])
    expect(store().toast?.text).toBe('Door added · Main · back — move or resize it in Openings')
    expect(history().pastStates).toHaveLength(1)
  })

  test('refusals change nothing and say why', () => {
    const before = store().plan
    addPartAt(POD, frame(), 2, 2, 'deck')
    expect(store().toast?.text).toBe(ACCESS_HOST_TEXT)
    store().setLocked(POD, true)
    history().clear()
    const locked = store().plan
    addPartAt(POD, frame(), 0, 3, 'deck')
    expect(store().plan).toBe(locked)
    expect(store().toast?.text).toMatch(/locked/)
    expect(pickedPartOf(store())).toBeNull()
    expect(before).not.toBe(locked) // the lock itself was the only change
  })
})
