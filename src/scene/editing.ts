import { withSize } from '../buildings/wingEdits'
import type { PlanObject } from '../store/types'

/** A live edit in progress (drag, rotate or resize) before it is committed to the store as one undo step. */
export interface DragState {
  readonly id: string
  readonly patch: (o: PlanObject) => Partial<PlanObject>
}

/** The live corner-drag resize of object `id`, drawn as resizeObject will commit it (a poly or blob's points scale too). */
export function resizeDrag(id: string, size: { readonly w: number; readonly d: number }): DragState {
  return { id, patch: (o) => ({ params: withSize(o.params, size.w, size.d) }) }
}
