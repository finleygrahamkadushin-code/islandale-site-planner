import { beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { readDisplayOptions } from '../store/persistence'
import { effectiveDisplay } from './displayOptions'

const store = () => usePlanStore.getState()

describe('display toggles (4B)', () => {
  test('each style has its own defaults', () => {
    expect(effectiveDisplay('realistic', {})).toEqual({ ao: true, shadows: true, edges: false })
    expect(effectiveDisplay('sketch', {})).toEqual({ ao: true, shadows: true, edges: true })
    expect(effectiveDisplay('diagram', {})).toEqual({ ao: true, shadows: false, edges: false })
  })

  test('a toggle overrides its style default', () => {
    expect(effectiveDisplay('realistic', { shadows: false, edges: true })).toEqual({ ao: true, shadows: false, edges: true })
  })

  describe('in the store', () => {
    beforeEach(() => {
      store().setDisplayStyle('realistic')
      usePlanStore.temporal.getState().clear()
    })

    test('turning one off is view state, not an undo step; a new style resets them', () => {
      store().setDisplayOption('ao', false)
      expect(store().displayOptions).toEqual({ ao: false })
      expect(usePlanStore.temporal.getState().pastStates).toHaveLength(0)
      store().setDisplayStyle('white')
      expect(store().displayOptions).toEqual({})
    })
  })

  test('saved toggles are read back, and anything else is dropped', () => {
    expect(readDisplayOptions({ ao: false, shadows: true, edges: 'yes', junk: 1 })).toEqual({ ao: false, shadows: true })
    expect(readDisplayOptions(null)).toEqual({})
  })
})
