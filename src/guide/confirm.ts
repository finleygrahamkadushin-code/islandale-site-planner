import { create } from 'zustand'
import { usePlanStore } from '../store/planStore'
import { useGuideMode } from './mode'

/**
 * Questions before a destructive step (4C), in one styled dialog instead of
 * the browser's `window.confirm`. View state only: asking never touches the plan.
 */

export interface ConfirmAsk {
  readonly title: string
  readonly body: string
  readonly confirmLabel: string
}

interface ConfirmState {
  readonly ask: ConfirmAsk | null
  readonly onYes: (() => void) | null
  readonly request: (ask: ConfirmAsk, onYes: () => void) => void
  readonly answer: (yes: boolean) => void
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  ask: null,
  onYes: null,
  request: (ask, onYes) => set({ ask, onYes }),
  answer: (yes) => {
    const run = get().onYes
    set({ ask: null, onYes: null })
    if (yes) run?.()
  },
}))

/** "the Guest cabin", "3 objects": what a delete question names. */
export function deleteSubject(ids: readonly string[]): string {
  if (ids.length !== 1) return `${ids.length} objects`
  const name = usePlanStore.getState().plan.objects[ids[0]]?.name
  return name ? `the ${name}` : 'this object'
}

/**
 * Delete through here (4C): Beginner asks first, Advanced deletes at once
 * (undo is the safety net there). Nothing to delete asks nothing.
 */
export function requestDelete(ids: readonly string[]): void {
  if (!ids.length) return
  const del = () => usePlanStore.getState().deleteObjects(ids)
  if (useGuideMode.getState().mode === 'advanced') {
    del()
    return
  }
  const subject = deleteSubject(ids)
  useConfirm.getState().request({ title: `Delete ${subject}?`, body: 'You can undo this.', confirmLabel: 'Delete' }, del)
}
