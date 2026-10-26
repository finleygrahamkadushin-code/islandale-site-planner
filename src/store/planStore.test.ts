import { beforeEach, describe, expect, test } from 'vitest'
import { isLabelShown, isObjectLocked, isObjectVisible, normalizeDeg, usePlanStore } from './planStore'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()
const firstId = () => store().plan.order[0]

describe('plan store', () => {
  beforeEach(() => {
    store().loadScheme('C')
    store().setLabelMode('all')
    store().lockAll(false)
    store().showAll()
    history().clear()
  })

  test('starts on Scheme C with the terrain and lot locked', () => {
    expect(store().plan.schemeId).toBe('C')
    expect(store().plan.order).toHaveLength(17)
    expect(store().siteLocked).toBe(true)
  })

  describe('edits return a new plan and are undoable', () => {
    test.each([
      ['move', () => store().moveObject(firstId(), { x: 5, n: -5 }), (o: Rec) => o.position],
      ['rotate', () => store().rotateObject(firstId(), 90), (o: Rec) => o.rotation],
      ['resize', () => store().resizeObject(firstId(), { w: 30, d: 20 }), (o: Rec) => [o.params.w, o.params.d]],
      ['params', () => store().setObjectParams(firstId(), { h: 12 }), (o: Rec) => o.params.h],
      ['rename', () => store().renameObject(firstId(), 'Hall'), (o: Rec) => o.name],
    ])('%s', (_name, act, read) => {
      const before = store().plan
      const id = firstId()
      act()
      const after = store().plan
      expect(after).not.toBe(before)
      expect(read(after.objects[id])).not.toEqual(read(before.objects[id]))
      expect(history().pastStates).toHaveLength(1)
      history().undo()
      expect(store().plan).toBe(before)
      history().redo()
      expect(store().plan).toBe(after)
    })

    test('delete removes the object and clears it from the selection', () => {
      const id = firstId()
      store().select([id])
      store().deleteObjects([id])
      expect(store().plan.objects[id]).toBeUndefined()
      expect(store().plan.order).not.toContain(id)
      expect(store().selection).toEqual([])
      history().undo()
      expect(store().plan.objects[id]).toBeDefined()
    })
  })

  describe('locks', () => {
    test('a locked object refuses move, rotate, resize, rename and delete, with a toast', () => {
      const id = firstId()
      store().setLocked(id, true)
      const locked = store().plan
      store().moveObject(id, { x: 99, n: 99 })
      store().rotateObject(id, 45)
      store().resizeObject(id, { w: 1, d: 1 })
      store().renameObject(id, 'nope')
      store().deleteObjects([id])
      expect(store().plan).toBe(locked)
      expect(store().toast?.text).toMatch(/locked/i)
      expect(history().pastStates).toHaveLength(1) // only the lock itself
    })

    test('unlocking a locked object is allowed', () => {
      const id = firstId()
      store().setLocked(id, true)
      store().setLocked(id, false)
      expect(isObjectLocked(store(), id)).toBe(false)
    })

    test('a locked layer locks every object in it', () => {
      const house = store().plan.order.find((id) => store().plan.objects[id].type === 'house')!
      const tree = store().plan.order.find((id) => store().plan.objects[id].type === 'tree')!
      store().setLayer('buildings', { locked: true })
      expect(isObjectLocked(store(), house)).toBe(true)
      expect(isObjectLocked(store(), tree)).toBe(false)
      const before = store().plan
      store().moveObject(house, { x: 1, n: 1 })
      expect(store().plan).toBe(before)
    })

    test('lock all and layer toggles are not undo steps', () => {
      store().lockAll(true)
      store().setLayer('trees', { visible: false })
      store().select([firstId()])
      expect(history().pastStates).toHaveLength(0)
      expect(isObjectLocked(store(), firstId())).toBe(true)
    })
  })

  describe('visibility and labels', () => {
    test('hiding a layer hides its objects and their labels', () => {
      const tree = store().plan.order.find((id) => store().plan.objects[id].type === 'tree')!
      store().setLayer('trees', { visible: false })
      expect(isObjectVisible(store(), tree)).toBe(false)
      expect(isLabelShown(store(), tree)).toBe(false)
      store().showAll()
      expect(isObjectVisible(store(), tree)).toBe(true)
    })

    test('label mode all / selected / none', () => {
      const id = firstId()
      expect(isLabelShown(store(), id)).toBe(true)
      store().setLabelMode('selected')
      expect(isLabelShown(store(), id)).toBe(false)
      store().select([id])
      expect(isLabelShown(store(), id)).toBe(true)
      store().setLabelMode('none')
      expect(isLabelShown(store(), id)).toBe(false)
    })

    test('a per-object label flag hides just that label', () => {
      const id = firstId()
      store().setLabelVisible(id, false)
      expect(isLabelShown(store(), id)).toBe(false)
      expect(isLabelShown(store(), store().plan.order[1])).toBe(true)
    })
  })

  test('loading a variant swaps the whole plan and is undoable', () => {
    store().loadScheme('C3')
    expect(store().plan.schemeId).toBe('C3')
    history().undo()
    expect(store().plan.schemeId).toBe('C')
  })

  test('rotation is normalised to (-180, 180]', () => {
    expect(normalizeDeg(370)).toBe(10)
    expect(normalizeDeg(-190)).toBe(170)
    expect(normalizeDeg(180)).toBe(180)
  })
})

type Rec = { position: unknown; rotation: unknown; name: unknown; params: Record<string, unknown> }
