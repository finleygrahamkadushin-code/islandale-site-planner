import { beforeEach, describe, expect, test } from 'vitest'
import { redoPlan, undoPlan, usePlanStore } from './planStore'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()
const firstId = () => store().plan.order[0]

beforeEach(() => {
  store().setReadOnly(null)
  store().loadScheme('C')
  history().clear()
})

describe('undo and redo in a read-only tab (R6.9)', () => {
  test('undo is refused, with the reason, while the tab is read-only', () => {
    store().renameObject(firstId(), 'Edited')
    const edited = store().plan
    store().setReadOnly('other-tab')
    undoPlan()
    expect(store().plan).toBe(edited)
    expect(store().toast?.text).toMatch(/another tab/)
  })

  test('redo is refused too', () => {
    store().renameObject(firstId(), 'Edited')
    undoPlan()
    const undone = store().plan
    store().setReadOnly('newer-file')
    redoPlan()
    expect(store().plan).toBe(undone)
  })

  test('both work in a writable tab', () => {
    const before = store().plan
    store().renameObject(firstId(), 'Edited')
    undoPlan()
    expect(store().plan).toBe(before)
    redoPlan()
    expect(store().plan.objects[firstId()].name).toBe('Edited')
  })
})

describe('the selection only holds objects that exist (R6.10)', () => {
  test('an object removed by redo leaves the selection, the hover and the opening focus', () => {
    const id = firstId()
    store().deleteObjects([id])
    undoPlan()
    store().select([id])
    store().setHovered(id)
    store().setOpeningFocus({ objectId: id, mass: 0, cutId: 1 })
    redoPlan()
    expect(store().plan.objects[id]).toBeUndefined()
    expect(store().selection).toEqual([])
    expect(store().hovered).toBeNull()
    expect(store().openingFocus).toBeNull()
  })

  test('of two selected objects, the one that redo removes leaves and the other stays', () => {
    const [a, b] = store().plan.order
    store().deleteObjects([b])
    undoPlan()
    store().select([a, b])
    redoPlan()
    expect(store().selection).toEqual([a])
  })

  test('select keeps only ids that exist, once each', () => {
    const id = firstId()
    store().select([id, 'ghost', id])
    expect(store().selection).toEqual([id])
  })

  test('a single id passed as a string is not split into letters', () => {
    const id = firstId()
    store().select(id as unknown as string[])
    expect(store().selection).toEqual([id])
    store().select('no-such-object' as unknown as string[])
    expect(store().selection).toEqual([])
  })
})
