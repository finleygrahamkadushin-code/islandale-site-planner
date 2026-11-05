import { beforeEach, describe, expect, test } from 'vitest'
import { ftToM } from '../site/units'
import { usePlanStore } from './planStore'
import { toolOf } from './toolActions'
import { layerOf } from './types'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()
const steps = () => history().pastStates.length
const obj = (id: string) => store().plan.objects[id]

describe('tools (4A)', () => {
  beforeEach(() => {
    store().loadScheme('C')
    store().lockAll(false)
    store().showAll()
    store().setTool('select')
    store().setSnap(true)
    history().clear()
  })

  describe('one current tool', () => {
    test('starts on Select', () => {
      expect(toolOf(store())).toBe('select')
    })

    test('starting one tool ends the others, and switching is never an undo step', () => {
      store().setTool('place', 'guest-cabin')
      expect(toolOf(store())).toBe('place')
      expect(store().placing).toMatchObject({ item: 'guest-cabin', rotation: 0, at: null })
      store().setTool('paint')
      expect(toolOf(store())).toBe('paint')
      expect(store().placing).toBeNull()
      store().setTool('connect')
      expect(toolOf(store())).toBe('connect')
      expect(store().painting).toBe(false)
      store().setTool('place', 'path-walk')
      expect(store().connecting).toBeNull()
      store().setTool('select')
      expect(toolOf(store())).toBe('select')
      expect([store().placing, store().connecting, store().painting]).toEqual([null, null, false])
      expect(steps()).toBe(0)
    })

    test('Place needs an item', () => {
      expect(() => store().setTool('place')).toThrow(/item/)
    })
  })

  describe('placing from the library', () => {
    test('one undo step, at the snapped click, selected, back to Select', () => {
      store().setTool('place', 'guest-cabin')
      const id = store().placeItem('guest-cabin', { x: 10.1, n: -3.2 }, 90)
      expect(id).not.toBeNull()
      const o = obj(id!)
      expect(o.type).toBe('house')
      expect(o.name).toBe('Guest cabin')
      expect(o.position.x).toBeCloseTo(ftToM(33), 10)
      expect(o.position.n).toBeCloseTo(ftToM(-10), 10)
      expect(o.rotation).toBe(90)
      expect(store().plan.order.at(-1)).toBe(id)
      expect(store().selection).toEqual([id])
      expect(toolOf(store())).toBe('select')
      expect(steps()).toBe(1)
      history().undo()
      expect(obj(id!)).toBeUndefined()
    })

    test('with Snap off it lands exactly at the click', () => {
      store().setSnap(false)
      const id = store().placeItem('red-alder', { x: 10.1, n: -3.2 }, 7)!
      expect(obj(id).position).toEqual({ x: 10.1, n: -3.2 })
      expect(obj(id).rotation).toBe(7)
    })

    test('a second copy gets a numbered name and a fresh id', () => {
      const a = store().placeItem('shed', { x: 0, n: 0 }, 0)!
      const b = store().placeItem('shed', { x: 10, n: 0 }, 0)!
      expect(a).not.toBe(b)
      expect(obj(b).name).toBe('Shed 2')
    })

    test('a path piece goes through the path tools (snapping to what it lands on)', () => {
      const id = store().placeItem('path-ramp', { x: 0, n: 0 }, 0)!
      expect(obj(id).type).toBe('pad')
      expect(obj(id).params.kind).toBe('ramp')
      expect(steps()).toBe(1)
    })

    test('refused on a locked layer, with a toast and no undo step', () => {
      store().setLayer('trees', { locked: true })
      const before = store().plan
      expect(store().placeItem('douglas-fir', { x: 0, n: 0 }, 0)).toBeNull()
      expect(store().plan).toBe(before)
      expect(store().toast?.text).toMatch(/Trees.*locked/)
      expect(steps()).toBe(0)
    })

    test('refused on a read-only tab', () => {
      store().setReadOnly('other-tab')
      expect(store().placeItem('shed', { x: 0, n: 0 }, 0)).toBeNull()
      store().setReadOnly(null)
    })
  })

  describe('duplicate', () => {
    const cabinId = () => store().plan.order.find((id) => obj(id).type === 'house')!

    test('copies 5 ft east and south as one undo step and selects the copies', () => {
      const src = obj(cabinId())
      const [copy] = store().duplicateObjects([src.id])
      expect(copy).toBeDefined()
      const c = obj(copy)
      expect(c.id).not.toBe(src.id)
      expect(c.position.x).toBeCloseTo(src.position.x + ftToM(5), 10)
      expect(c.position.n).toBeCloseTo(src.position.n - ftToM(5), 10)
      expect(c.params).toEqual(src.params)
      expect(c.params).not.toBe(src.params)
      expect(c.name).not.toBe(src.name)
      expect(c.locked).toBe(false)
      expect(store().selection).toEqual([copy])
      expect(steps()).toBe(1)
    })

    test('several at once are still one undo step', () => {
      const ids = store().plan.order.slice(0, 3)
      expect(store().duplicateObjects(ids)).toHaveLength(3)
      expect(steps()).toBe(1)
    })

    test('refused whole when any of them is on a locked layer', () => {
      const id = cabinId()
      store().setLayer(layerOf(obj(id)), { locked: true })
      const before = store().plan
      expect(store().duplicateObjects([id])).toEqual([])
      expect(store().plan).toBe(before)
      expect(store().toast?.text).toMatch(/locked/)
      expect(steps()).toBe(0)
    })
  })

  describe('turning (Q / E / R)', () => {
    const id = () => store().plan.order[0]

    test.each([
      ['E', 5],
      ['Q', -5],
      ['R', 90],
    ])('%s turns by %i° as one undo step', (_key, by) => {
      const before = obj(id()).rotation
      store().turnObjects([id()], by)
      const after = obj(id()).rotation
      expect(((after - before + 540) % 360) - 180).toBeCloseTo(by, 10)
      expect(steps()).toBe(1)
    })

    test('a locked object stays put', () => {
      store().setLocked(id(), true)
      history().clear()
      const before = store().plan
      store().turnObjects([id()], 5)
      expect(store().plan).toBe(before)
      expect(steps()).toBe(0)
    })
  })
})
