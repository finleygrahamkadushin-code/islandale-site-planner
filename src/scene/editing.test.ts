import { describe, expect, test } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { resizeDrag } from './editing'

const store = () => usePlanStore.getState()

describe('resizeDrag', () => {
  test('the live corner drag of C-0 (poly main walls) shows the points the release commits', () => {
    store().setReadOnly(null)
    store().loadScheme('C')
    store().lockAll(false)
    const o = store().plan.objects['C-0']
    expect(o.params.shape).toBe('poly')
    const size = { w: 60, d: Number(o.params.d) }
    const live = resizeDrag(o.id, size).patch(o).params as Record<string, unknown>
    expect(live.pts).not.toEqual(o.params.pts)
    store().resizeObject(o.id, size)
    const committed = store().plan.objects['C-0'].params
    expect(live).toMatchObject({ w: committed.w, d: committed.d, pts: committed.pts })
    usePlanStore.temporal.getState().clear()
  })

  test('a rect object just takes the new numbers', () => {
    const o = { id: 'x', params: { w: 10, d: 8, h: 9 } } as never
    expect(resizeDrag('x', { w: 12, d: 6 }).patch(o)).toEqual({ params: { w: 12, d: 6, h: 9 } })
  })
})
