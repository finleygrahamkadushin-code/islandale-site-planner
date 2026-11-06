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

  test('asks first, and Cancel keeps the plan', () => {
    openScheme('H')
    expect(useConfirm.getState().ask?.title).toBe('Open H · Sod & Contour?')
    useConfirm.getState().answer(false)
    expect(usePlanStore.getState().plan.schemeId).toBe('C')
  })

  test('Open loads it in one undo step, selects the gathering building, frames the view and says so', () => {
    const n = usePlanStore.getState().viewRequest?.n ?? 0
    openScheme('H')
    useConfirm.getState().answer(true)
    const s = usePlanStore.getState()
    expect(s.plan.schemeId).toBe('H')
    expect(s.plan.objects[s.selection[0]].name).toMatch(/Gathering/)
    expect(s.viewRequest).toEqual({ id: 'overview', n: n + 1 })
    expect(s.toast?.text).toBe('Opened H · Sod & Contour')
    expect(usePlanStore.temporal.getState().pastStates.length).toBe(1)
    usePlanStore.temporal.getState().undo()
    expect(usePlanStore.getState().plan.schemeId).toBe('C')
  })

  test('a rules-off scheme says so', () => {
    openSchemeNow('F')
    expect(usePlanStore.getState().toast?.text).toBe(openedText('F · Sky Datum', true))
    expect(openedText('F · Sky Datum', true)).toMatch(/Rules off/)
  })

  test('every scheme has a building to select', () => {
    for (const s of usePlanStore.getState().schemes) {
      openSchemeNow(s.id)
      expect(gatheringBuilding(usePlanStore.getState().plan), s.id).not.toBeNull()
    }
  })
})

describe('cabins without a floor plan (5F)', () => {
  test('F, I, two of E and one of H have none; C has all', async () => {
    const { hasFloorPlan } = await import('../../interiors/model')
    const missing = (id: string) => {
      openSchemeNow(id)
      const p = usePlanStore.getState().plan
      return p.order.map((k) => p.objects[k]).filter((o) => o.type === 'house' && !hasFloorPlan(o.params)).length
    }
    expect([missing('C'), missing('E'), missing('F'), missing('H'), missing('I')]).toEqual([0, 2, 5, 1, 3])
  })
})
