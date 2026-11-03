import type { EditResult, Selection } from '../interiors/edits'
import { idCounter, newFloor, readFloors } from '../interiors/model'
import type { Floor } from '../interiors/types'
import { num } from '../buildings/footprint'
import type { PlanState } from './planStore'
import type { ObjectId, PlanObject } from './types'

/**
 * The floor-plan actions of the plan store (5B). A cabin's floors live in
 * its params as the old planner stores them; every edit writes them back
 * in full (migrated from older forms on the first edit). Each is one undo
 * step, refused on a read-only tab or a locked cabin, and a refused edit
 * shows the old editor's message.
 */

type Params = Record<string, unknown>

/** An edit of one floor: the cabin's params, that floor and an id source in, the new floor (or a refusal) out. */
export type FloorEdit = (params: Params, floor: Floor, nextId: () => number) => EditResult

/** Walls must be at least this tall (ft) for an upper floor, as in the old planner. */
export const UPPER_FLOOR_MIN_H = 15
/** A cabin has at most a main floor and one upper floor. */
export const MAX_FLOORS = 2

export interface InteriorActions {
  /** Apply an edit to floor `fi` of a cabin; returns what to select, or null when it was refused. */
  readonly editFloor: (id: ObjectId, fi: number, op: FloorEdit) => Selection | null
  /** Add an upper floor, with the main floor's stair rooms carried up; returns its index, or null when refused. */
  readonly addFloor: (id: ObjectId) => number | null
  readonly renameFloor: (id: ObjectId, fi: number, name: string) => void
  /** Remove the upper floor and everything on it. */
  readonly removeFloor: (id: ObjectId, fi: number) => void
}

export interface InteriorContext {
  readonly get: () => PlanState
  readonly editable: (id: ObjectId) => PlanObject | null
  readonly edit: (id: ObjectId, patch: (o: PlanObject) => PlanObject) => void
}

const withFloors = (o: PlanObject, floors: readonly Floor[]): PlanObject => ({ ...o, params: { ...o.params, floors } })

/** Why an upper floor cannot be added, or null when it can. */
export const upperFloorBlocked = (o: PlanObject): string | null => {
  const floors = Array.isArray(o.params.floors) ? o.params.floors.length : 1
  if (floors >= MAX_FLOORS) return 'This cabin already has an upper floor'
  if (num(o.params.h, 9) < UPPER_FLOOR_MIN_H) return `Raise the walls to ${UPPER_FLOOR_MIN_H} ft or more to add an upper floor`
  return null
}

export function interiorActions({ get, editable, edit }: InteriorContext): InteriorActions {
  return {
    editFloor: (id, fi, op) => {
      const o = editable(id)
      if (!o) return null
      const floors = readFloors(o.params)
      const floor = floors[fi]
      if (!floor) return null
      const res = op(o.params, floor, idCounter(floors))
      if (!res.ok) {
        get().showToast(res.message)
        return null
      }
      edit(id, (cur) => withFloors(cur, floors.map((f, i) => (i === fi ? res.floor : f))))
      return res.select ?? {}
    },
    addFloor: (id) => {
      const o = editable(id)
      if (!o) return null
      const blocked = upperFloorBlocked(o)
      if (blocked) {
        get().showToast(blocked)
        return null
      }
      const floors = readFloors(o.params)
      const nextId = idCounter(floors)
      const stairs = floors[0].rooms.filter((r) => r.type === 'stairs').map((r) => ({ ...r, id: nextId() }))
      edit(id, (cur) => withFloors(cur, [...floors, { ...newFloor('Upper floor'), rooms: stairs }]))
      return floors.length
    },
    renameFloor: (id, fi, name) => {
      const o = editable(id)
      const trimmed = name.trim().slice(0, 40)
      if (!o || !trimmed) return
      const floors = readFloors(o.params)
      if (!floors[fi]) return
      edit(id, (cur) => withFloors(cur, floors.map((f, i) => (i === fi ? { ...f, name: trimmed } : f))))
    },
    removeFloor: (id, fi) => {
      const o = editable(id)
      if (!o || fi < 1) return
      const floors = readFloors(o.params)
      if (!floors[fi]) return
      edit(id, (cur) => withFloors(cur, floors.filter((_, i) => i !== fi)))
    },
  }
}
