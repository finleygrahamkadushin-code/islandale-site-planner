import { create } from 'zustand'
import type { ObjectId } from '../store/types'

/**
 * Add to selection (R10.2): multi-select without a modifier key, for touch
 * and one-handed use. While on, a click on an object adds or removes it (as
 * a Shift-click does) and a drag on empty ground draws a box that adds to
 * the selection. A tool strip toggle and command search switch it. View
 * state: never an undo step, never saved.
 */
export const useAddMode = create<{ readonly on: boolean; readonly setOn: (on: boolean) => void }>((set) => ({
  on: false,
  setOn: (on) => set({ on }),
}))

/** Whether a click or ground press adds to the selection: Shift, or the mode. */
export function addsToSelection(e: { readonly shiftKey: boolean }): boolean {
  return e.shiftKey || useAddMode.getState().on
}

/** The selection after a box: a Shift box replaces it, a box in the mode adds to it, each id once. */
export function afterBox(prev: readonly ObjectId[], boxed: readonly ObjectId[], add: boolean): ObjectId[] {
  return add ? [...new Set([...prev, ...boxed])] : [...boxed]
}
