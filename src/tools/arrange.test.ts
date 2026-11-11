import { beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { alignedPositions, distributedPositions, idsInBox } from './arrange'
import { M_PER_FT as FT } from '../site/units'

const box = (id: string, x: number, n: number, w = 10, d = 10): PlanObject => ({ id, type: 'pad', name: id, position: { x, n }, rotation: 0, params: { w, d }, locked: false, hidden: false, labelVisible: true })
const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()

describe('arranging several objects (4B)', () => {
  const a = box('a', 0, 0)
  const b = box('b', 10, 4, 20)
  const c = box('c', 30, -6)

  test('align west edges: every footprint box starts where the westmost does', () => {
    const at = alignedPositions([a, b, c], 'west')
    const west = -5 * FT
    expect(at.a.x).toBeCloseTo(0, 6)
    expect(at.b.x - 10 * FT).toBeCloseTo(west, 6)
    expect(at.c.x - 5 * FT).toBeCloseTo(west, 6)
    expect(at.b.n).toBe(4)
  })

  test('align north centres: every centre on the middle of the group', () => {
    const at = alignedPositions([a, b, c], 'centre-n')
    const mid = (4 + 5 * FT + (-6 - 5 * FT)) / 2
    for (const id of ['a', 'b', 'c']) expect(at[id].n).toBeCloseTo(mid, 6)
  })

  test('distribute east-west: the end objects stay, the middle ones are evenly spaced by centre', () => {
    const at = distributedPositions([c, a, b], 'x')
    expect(at.a.x).toBe(0)
    expect(at.c.x).toBe(30)
    expect(at.b.x).toBeCloseTo(15, 6)
  })

  test('box select takes the visible objects whose centre is inside, whichever corner the drag started from', () => {
    expect(idsInBox([a, b, c, { ...box('h', 1, 1), hidden: true }], { x: 12, n: 5 }, { x: -1, n: -1 }).sort()).toEqual(['a', 'b'])
  })

  describe('in the store', () => {
    beforeEach(() => {
      store().loadScheme('C')
      store().lockAll(false)
      history().clear()
    })

    test('align and distribute are one undo step each; locked objects stay put', () => {
      const ids = store().plan.order.slice(0, 3)
      store().setLocked(ids[2], true)
      history().clear()
      const lockedAt = store().plan.objects[ids[2]].position
      store().alignObjects(ids, 'south')
      expect(history().pastStates).toHaveLength(1)
      expect(store().plan.objects[ids[2]].position).toEqual(lockedAt)
      store().distributeObjects(ids, 'n')
      expect(history().pastStates).toHaveLength(2)
    })
  })
})
