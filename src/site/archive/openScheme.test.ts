import { beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from '../../store/planStore'
import { useConfirm } from '../../guide/confirm'
import { gatheringBuilding, openScheme, openSchemeNow, openedText } from './openScheme'

describe('opening a scheme (5F)', () => {
  beforeEach(() => {
    usePlanStore.getState().loadScheme('C')
    usePlanStore.getState().select([])
    usePlanStore.temporal.getState().clear()
    useConfirm.getState().answer(false)
  })

  /** Scheme C cleared to the bare lot, with no undo history, so opening C changes the plan. */
  const cleared = () => {
    usePlanStore.getState().clearPlan()
    usePlanStore.temporal.getState().clear()
    return usePlanStore.getState().plan
  }

  test('asks first, and Cancel keeps the plan', () => {
    const bare = cleared()
    openScheme('C')
    expect(useConfirm.getState().ask?.title).toBe('Open C · Prow & Lantern?')
    useConfirm.getState().answer(false)
    expect(usePlanStore.getState().plan).toBe(bare)
  })

  test('Open loads it in one undo step, selects the gathering building, frames the view and says so', () => {
    const bare = cleared()
    const n = usePlanStore.getState().viewRequest?.n ?? 0
    openScheme('C')
    useConfirm.getState().answer(true)
    const s = usePlanStore.getState()
    expect(s.plan.schemeId).toBe('C')
    expect(s.plan.order.length).toBeGreaterThan(bare.order.length)
    expect(s.plan.objects[s.selection[0]].name).toMatch(/Gathering/)
    expect(s.viewRequest).toEqual({ id: 'overview', n: n + 1 })
    expect(s.toast?.text).toBe('Opened C · Prow & Lantern')
    expect(usePlanStore.temporal.getState().pastStates.length).toBe(1)
    usePlanStore.temporal.getState().undo()
    expect(usePlanStore.getState().plan.order).toEqual(bare.order)
  })

  test('a rules-off scheme says so', () => {
    expect(openedText('C · Prow & Lantern', true)).toMatch(/Rules off/)
    expect(openedText('C · Prow & Lantern', false)).not.toMatch(/Rules off/)
  })

  test('every scheme has a building to select', () => {
    for (const s of usePlanStore.getState().schemes) {
      openSchemeNow(s.id)
      expect(gatheringBuilding(usePlanStore.getState().plan), s.id).not.toBeNull()
    }
  })
})

describe('cabins without a floor plan (5F)', () => {
  test('every cabin of Scheme C has one', async () => {
    const { hasFloorPlan } = await import('../../interiors/model')
    const missing = (id: string) => {
      openSchemeNow(id)
      const p = usePlanStore.getState().plan
      return p.order.map((k) => p.objects[k]).filter((o) => o.type === 'house' && !hasFloorPlan(o.params)).length
    }
    expect(missing('C')).toBe(0)
  })
})
