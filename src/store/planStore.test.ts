import { beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from './planStore'

describe('plan store', () => {
  beforeEach(() => {
    usePlanStore.getState().loadScheme('C')
    usePlanStore.temporal.getState().clear()
  })

  test('starts on Scheme C with the terrain and lot locked', () => {
    const s = usePlanStore.getState()
    expect(s.plan.schemeId).toBe('C')
    expect(s.plan.order.length).toBe(17)
    expect(s.siteLocked).toBe(true)
  })

  test('locking an object returns a new plan and is undoable', () => {
    const before = usePlanStore.getState().plan
    const id = before.order[0]
    usePlanStore.getState().setLocked(id, true)
    const after = usePlanStore.getState().plan
    expect(after).not.toBe(before)
    expect(before.objects[id].locked).toBe(false)
    expect(after.objects[id].locked).toBe(true)
    usePlanStore.temporal.getState().undo()
    expect(usePlanStore.getState().plan.objects[id].locked).toBe(false)
  })

  test('selection changes are not recorded as undo steps', () => {
    usePlanStore.getState().select([usePlanStore.getState().plan.order[0]])
    expect(usePlanStore.temporal.getState().pastStates).toHaveLength(0)
  })

  test('loading a variant swaps the whole plan', () => {
    usePlanStore.getState().loadScheme('C3')
    expect(usePlanStore.getState().plan.schemeId).toBe('C3')
    expect(usePlanStore.getState().selection).toEqual([])
  })
})
