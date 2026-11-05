import { create } from 'zustand'
import { withSize } from '../buildings/parts/wingEdits'
import type { PlanObject } from '../store/types'

/** A live edit in progress (drag, rotate or resize) before it is committed to the store as one undo step. */
export interface DragState {
  readonly id: string
  readonly patch: (o: PlanObject) => Partial<PlanObject>
  /** A group drag (4B): every object here follows with the same patch, `id` the one under the pointer. */
  readonly group?: readonly string[]
}

/** Whether a live drag moves this object (it is the one dragged, or in the dragged group). */
export const dragMoves = (drag: DragState | null, id: string): boolean => !!drag && (drag.id === id || !!drag.group?.includes(id))

/**
 * The one live edit, if any (view state, never saved or undone). The scene
 * draws objects, labels and gizmos where it has them; whoever started it
 * (a gizmo, a handle, a drag on the object itself) commits it on release.
 */
export const useLiveDrag = create<{ readonly drag: DragState | null; readonly setDrag: (d: DragState | null) => void }>((set) => ({
  drag: null,
  setDrag: (drag) => set({ drag }),
}))

/** The live corner-drag resize of object `id`, drawn as resizeObject will commit it (a poly or blob's points scale too). */
export function resizeDrag(id: string, size: { readonly w: number; readonly d: number }): DragState {
  return { id, patch: (o) => ({ params: withSize(o.params, size.w, size.d) }) }
}
