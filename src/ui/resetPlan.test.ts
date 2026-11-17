import { beforeEach, describe, expect, test } from 'vitest'
import { currentPlanText } from '../export/planFile'
import { useConfirm } from '../guide/confirm'
import { usePlanStore } from '../store/planStore'
import { createDefaultStore, type DefaultStore } from '../store/planDefault'
import { askReset, askResetOriginal, askSaveDefault } from './resetPlan'

const store = () => usePlanStore.getState()
const memory = (): { text: string | null; store: DefaultStore } => {
  const m: { text: string | null; store: DefaultStore } = {
    text: null,
    store: { label: 'memory', read: async () => m.text, write: async (t) => void (m.text = t) },
  }
  return m
}

describe('Save as default scheme, and what Reset loads', () => {
  beforeEach(() => {
    store().setReadOnly(null)
    store().loadScheme('C')
    usePlanStore.temporal.getState().clear()
    useConfirm.getState().answer(false)
  })

  /** Scheme C with its first object removed: a plan that is not the original. */
  const edited = () => {
    const id = store().plan.order[0]
    store().deleteObjects([id])
    return store().plan
  }

  test('asks first; Cancel saves nothing', async () => {
    const m = memory()
    askSaveDefault(m.store)
    expect(useConfirm.getState().ask?.title).toBe('Make this plan the default?')
    expect(useConfirm.getState().ask?.body).toContain('Reset to original Scheme C')
    useConfirm.getState().answer(false)
    await Promise.resolve()
    expect(m.text).toBeNull()
  })

  test('Confirm writes the plan exactly as the plan file is written', async () => {
    const m = memory()
    askSaveDefault(m.store)
    const expected = currentPlanText()
    useConfirm.getState().answer(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(m.text).not.toBeNull()
    expect(JSON.parse(m.text as string).plan).toEqual(JSON.parse(expected).plan)
    expect(store().toast?.text).toBe('Saved as your default scheme')
  })

  test('a failed save says so', async () => {
    const failing: DefaultStore = { label: 'x', read: async () => null, write: async () => Promise.reject(new Error('disk full')) }
    askSaveDefault(failing)
    useConfirm.getState().answer(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(store().toast?.text).toBe('Could not save the default: disk full')
  })

  test('Reset with a saved default asks about the default and loads it, undoably', async () => {
    const m = memory()
    const original = store().plan
    const id = original.order[0]
    store().deleteObjects([id])
    const mine = store().plan
    m.text = currentPlanText()
    // wander off from the default
    store().loadScheme('C')
    usePlanStore.temporal.getState().clear()
    expect(store().plan.order).toContain(id)

    await askReset(m.store)
    expect(useConfirm.getState().ask?.title).toBe('Go back to your saved default?')
    useConfirm.getState().answer(true)
    expect(store().plan.order).toEqual(mine.order)
    expect(store().plan.order).not.toContain(id)
    expect(usePlanStore.temporal.getState().pastStates.length).toBe(1)
    usePlanStore.temporal.getState().undo()
    expect(store().plan.order).toContain(id)
  })

  test('Reset with no default loads the original Scheme C, as before', async () => {
    const before = edited()
    await askReset(memory().store)
    expect(useConfirm.getState().ask?.title).toBe('Go back to Scheme C?')
    useConfirm.getState().answer(true)
    expect(store().plan).not.toBe(before)
    expect(store().plan.order.length).toBeGreaterThan(before.order.length)
    expect(store().plan.schemeId).toBe('C')
  })

  test('Reset to original ignores a saved default', async () => {
    const m = memory()
    m.text = currentPlanText()
    const id = store().plan.order[0]
    store().deleteObjects([id])
    askResetOriginal()
    expect(useConfirm.getState().ask?.title).toBe('Go back to Scheme C?')
    useConfirm.getState().answer(true)
    expect(store().plan.order).toContain(id)
    usePlanStore.temporal.getState().undo()
    expect(store().plan.order).not.toContain(id)
  })

  test('an unreadable default is reported and leaves the plan alone', async () => {
    const m = memory()
    m.text = 'not json'
    const before = store().plan
    await askReset(m.store)
    useConfirm.getState().answer(true)
    expect(store().plan).toBe(before)
    expect(store().toast?.text).toMatch(/^Could not open the saved default/)
  })

  test('a read-only tab keeps its plan', async () => {
    const m = memory()
    m.text = currentPlanText()
    store().setReadOnly('other-tab')
    const before = store().plan
    await askReset(m.store)
    useConfirm.getState().answer(true)
    expect(store().plan).toBe(before)
    store().setReadOnly(null)
  })

  test('the localStorage store round-trips through Reset', async () => {
    const m = new Map<string, string>()
    const ls = createDefaultStore({ dev: false, storage: () => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }) })
    askSaveDefault(ls)
    useConfirm.getState().answer(true)
    await new Promise((r) => setTimeout(r, 0))
    await askReset(ls)
    expect(useConfirm.getState().ask?.title).toBe('Go back to your saved default?')
  })
})
