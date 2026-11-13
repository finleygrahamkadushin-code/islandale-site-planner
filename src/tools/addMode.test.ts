import { afterEach, describe, expect, it } from 'vitest'
import { addsToSelection, afterBox, useAddMode } from './addMode'

/** R10.2: multi-select must be reachable without a modifier key (touch, one-handed use). */
describe('Add to selection (no modifier key)', () => {
  afterEach(() => useAddMode.getState().setOn(false))

  it('a plain click replaces the selection while the mode is off', () => {
    expect(addsToSelection({ shiftKey: false })).toBe(false)
  })

  it('Shift adds, as before', () => {
    expect(addsToSelection({ shiftKey: true })).toBe(true)
  })

  it('with the mode on, a click without Shift adds', () => {
    useAddMode.getState().setOn(true)
    expect(addsToSelection({ shiftKey: false })).toBe(true)
  })

  it('a Shift box replaces the selection, a box in the mode adds to it once each', () => {
    expect(afterBox(['a', 'b'], ['c'], false)).toEqual(['c'])
    expect(afterBox(['a', 'b'], ['b', 'c'], true)).toEqual(['a', 'b', 'c'])
    expect(afterBox(['a'], [], true)).toEqual(['a'])
  })
})
