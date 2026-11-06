import { beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from '../../store/planStore'
import { isWalkToRebuild } from './rebuildWalks'

const walks = () => {
  const p = usePlanStore.getState().plan
  return p.order.map((id) => p.objects[id]).filter(isWalkToRebuild)
}

describe('Rebuild walks as path pieces (store action)', () => {
  beforeEach(() => {
    const s = usePlanStore.getState()
    s.loadScheme('C')
    s.setLayer('paths', { locked: false })
    usePlanStore.temporal.getState().clear()
  })

  test('replaces every walk in one undo step, and undo brings them back', () => {
    const before = walks().length
    expect(before).toBeGreaterThan(0)
    const r = usePlanStore.getState().rebuildWalks()!
    expect(r.walks).toBe(before)
    expect(walks()).toHaveLength(0)
    expect(usePlanStore.temporal.getState().pastStates.length).toBe(1)
    expect(usePlanStore.getState().toast?.text).toMatch(/^Rebuilt \d+ walks as \d+ path pieces/)
    usePlanStore.temporal.getState().undo()
    expect(walks()).toHaveLength(before)
  })

  test('a locked walk is left as it was; a locked paths layer refuses', () => {
    const lane = walks()[0]
    usePlanStore.getState().setLocked(lane.id, true)
    usePlanStore.temporal.getState().clear()
    const r = usePlanStore.getState().rebuildWalks()!
    expect(r.skipped).toEqual([lane.name])
    expect(walks().map((o) => o.id)).toEqual([lane.id])
    usePlanStore.temporal.getState().undo()
    usePlanStore.getState().setLayer('paths', { locked: true })
    expect(usePlanStore.getState().rebuildWalks()).toBeNull()
    expect(usePlanStore.getState().toast?.text).toBe('Decks and paths are locked')
  })

  test('nothing to do a second time', () => {
    usePlanStore.getState().rebuildWalks()
    usePlanStore.getState().rebuildWalks()
    expect(usePlanStore.getState().toast?.text).toMatch(/No walks to rebuild/)
    expect(usePlanStore.temporal.getState().pastStates.length).toBe(1)
  })
})
