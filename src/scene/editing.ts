import type { PlanObject } from '../store/types'

/** A live edit in progress (drag, rotate or resize) before it is committed to the store as one undo step. */
export interface DragState {
  readonly id: string
  readonly patch: (o: PlanObject) => Partial<PlanObject>
}
