import { beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from './planStore'
import { massCuts, massWalls } from '../buildings/openingEdits'
import type { CutData } from '../buildings/openingLayout'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()
const houseWithWing = () => {
  const s = store()
  return s.plan.order.find((i) => {
    const o = s.plan.objects[i]
    return o.type === 'house' && Array.isArray(o.params.wings) && (o.params.wings as unknown[]).length > 0
  })!
}
const params = (id: string) => store().plan.objects[id].params

describe('opening actions', () => {
  beforeEach(() => {
    store().setReadOnly(null)
    store().loadScheme('C')
    store().lockAll(false)
    history().clear()
  })

  test('adding a window stores it fitted, with a new id, as one undo step', () => {
    const id = houseWithWing()
    const before = massCuts(params(id), 0)
    store().addOpening(id, 0, { kind: 'window', edge: 0, x: 0, w: 3, h: 4, sill: 3 })
    const after = massCuts(params(id), 0)
    expect(after).toHaveLength(before.length + 1)
    const added = after.at(-1)!
    expect(added.id).toBeGreaterThan(0)
    expect(added.x).toBeGreaterThan(0.75) // pushed clear of the corner
    expect(history().pastStates).toHaveLength(1)
    history().undo()
    expect(massCuts(params(id), 0)).toHaveLength(before.length)
  })

  test('updating a wing’s opening leaves the wing’s other fields alone', () => {
    const id = houseWithWing()
    const wings = params(id).wings as Record<string, unknown>[]
    // the widest wing, so a small window fits on its back wall (edge 0 runs its width)
    const slot = wings.reduce((best, w, i) => (Number(w.w) > Number(wings[best].w) ? i : best), 0)
    store().addOpening(id, slot + 1, { kind: 'window', edge: 0, x: 2, w: 1.5, h: 2, sill: 3 })
    const cut = massCuts(params(id), slot + 1).at(-1) as CutData
    store().updateOpening(id, slot + 1, cut.id!, { w: 1.25 })
    const wing = (params(id).wings as Record<string, unknown>[])[slot]
    const { cuts: _a, ...rest } = wing
    const { cuts: _b, ...was } = wings[slot]
    expect(rest).toEqual(was)
    expect(massCuts(params(id), slot + 1).at(-1)?.w).toBe(1.25)
  })

  test('every opening action is refused on a locked cabin', () => {
    const id = houseWithWing()
    store().setLocked(id, true)
    history().clear()
    const before = store().plan
    store().addOpening(id, 0, { kind: 'window', edge: 0, x: 2, w: 3, h: 4, sill: 3 })
    store().removeOpening(id, 0, 1)
    store().fitAllOpenings(id)
    expect(store().plan).toBe(before)
    expect(store().toast?.text).toMatch(/locked/)
  })

  test('resizing a cabin re-fits its openings in the same undo step', () => {
    const id = houseWithWing()
    store().addOpening(id, 0, { kind: 'window', edge: 0, x: 4, w: 3, h: 4, sill: 3 })
    history().clear()
    const w = Number(params(id).w)
    store().resizeObject(id, { w: Math.max(6, w / 3), d: Number(params(id).d) })
    expect(history().pastStates).toHaveLength(1)
    const walls = massWalls(params(id), 0)
    for (const c of massCuts(params(id), 0).filter((c) => !c.along)) {
      expect((c.x ?? 0) + (c.w ?? 0)).toBeLessThanOrEqual(walls[c.edge ?? 0].lengthFt)
    }
  })

  test('centre puts an opening in the middle of its wall, and align heads lines the windows up', () => {
    const id = houseWithWing()
    store().addOpening(id, 0, { kind: 'window', edge: 0, x: 1, w: 2, h: 4, sill: 2 })
    store().addOpening(id, 0, { kind: 'window', edge: 0, x: 6, w: 2, h: 3, sill: 3 })
    const [a, b] = massCuts(params(id), 0).slice(-2)
    store().centreOpening(id, 0, b.id!)
    store().alignHeads(id, 0, a.id!)
    const [, b2] = massCuts(params(id), 0).slice(-2)
    expect((b2.sill ?? 0) + (b2.h ?? 0)).toBeCloseTo((a.sill ?? 0) + (a.h ?? 0), 6)
  })
})
