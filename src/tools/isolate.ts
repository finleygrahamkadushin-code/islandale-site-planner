import { create } from 'zustand'
import type { ObjectId, Plan } from '../store/types'
import { groupMembers } from './groups'

/**
 * Isolate and edit (like SketchUp's group editing): double-click an object,
 * or a member of a group, to work on it alone. Everything else (`rest`)
 * fades or hides and can't be picked. View state: never an undo step, never
 * saved. Objects made while isolated (placed, duplicated) are not in `rest`,
 * so they stay in reach.
 */
export interface Isolation {
  /** What was double-clicked: the object, or every member of its group. */
  readonly focus: readonly ObjectId[]
  /** The group open for editing, where a click picks one member; null for a single object. */
  readonly group: string | null
  /** What the chip calls it. */
  readonly name: string
  /** The objects faded or hidden. */
  readonly rest: ReadonlySet<ObjectId>
}

/**
 * The isolation a double-click on `id` gives. Inside an open group, a
 * double-click on a member narrows to that member; on what is already
 * isolated alone, nothing changes.
 */
export function isolationFor(plan: Plan, id: ObjectId, current: Isolation | null): Isolation | null {
  const o = plan.objects[id]
  if (!o) return current
  if (current && current.group === null && current.focus.length === 1 && current.focus[0] === id) return current
  const narrowing = !!current?.group && o.group === current.group
  const group = narrowing ? null : (o.group ?? null)
  const focus = group ? groupMembers(plan, id) : [id]
  const keep = new Set(focus)
  return {
    focus,
    group,
    name: group ? `Group of ${focus.length}` : o.name,
    rest: new Set(plan.order.filter((k) => !keep.has(k))),
  }
}

/** Faded or hidden by the isolation, so it can't be picked. */
export function isOutside(iso: Isolation | null, id: ObjectId): boolean {
  return !!iso && iso.rest.has(id)
}

/** Whether what was double-clicked is still in the plan (undo, delete or loading a scheme can take it away). */
export function isolationAlive(iso: Isolation, plan: Plan): boolean {
  return iso.focus.some((id) => !!plan.objects[id])
}

interface IsolateState {
  readonly isolation: Isolation | null
  /** Hide the rest instead of fading it. Kept between isolations. */
  readonly hideRest: boolean
  readonly enter: (plan: Plan, id: ObjectId) => void
  readonly leave: () => void
  readonly setHideRest: (hide: boolean) => void
}

export const useIsolate = create<IsolateState>()((set, get) => ({
  isolation: null,
  hideRest: false,
  enter: (plan, id) => set({ isolation: isolationFor(plan, id, get().isolation) }),
  leave: () => set({ isolation: null }),
  setHideRest: (hideRest) => set({ hideRest }),
}))

/** The isolation now, for code outside React. */
export const isolationNow = (): Isolation | null => useIsolate.getState().isolation

/**
 * Double-clicks an object took. The view's own double-click (on empty space)
 * runs after the 3D one for the same native event, and leaves isolation only
 * when no object claimed it.
 */
const claimed = new WeakSet<Event>()
export const claimDoubleClick = (e: Event): void => {
  claimed.add(e)
}
export const wasClaimed = (e: Event): boolean => claimed.has(e)
