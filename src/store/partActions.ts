import { buildingMasses, MAX_WINGS, massPoly, wingSlots } from '../buildings/masses'
import { buildingRailStyle, withRailStyle, writeAll, writeEdge, type RailState, type RailStyle } from '../buildings/railEdits'
import { withAddedWing, withoutWing, withWing } from '../buildings/wingEdits'
import { railDraws } from './railResolver'
import type { PickedPart, PlanState } from './planStore'
import type { ObjectId, Plan, PlanObject } from './types'

/**
 * The building-part actions of the plan store (5A): wings added, changed
 * and removed, per-edge rails and the rail style, and the picked part.
 * Mass 0 is the main walls, mass n the n-th wing, as everywhere else. Each
 * plan change is one `edit`, so one undo step, refused on a read-only tab
 * or a locked building (its own padlock or its layer's).
 */

type Params = Record<string, unknown>

export interface PartContext {
  readonly get: () => PlanState
  readonly set: (partial: Partial<PlanState>) => void
  /** The object when this tab may change it; otherwise null, with the read-only or locked toast. */
  readonly editable: (id: ObjectId) => PlanObject | null
  readonly edit: (id: ObjectId, patch: (o: PlanObject) => PlanObject) => void
  /** Change a cabin's params and re-fit its openings, as one edit. */
  readonly editRefit: (id: ObjectId, change: (p: Params) => Params) => void
}

export type PartActions = Pick<PlanState, 'updateWing' | 'addWing' | 'removeWing' | 'setRail' | 'setRailStyle' | 'pickPart'>

export const MAX_PARTS_TEXT = `A cabin takes at most ${MAX_WINGS} parts`
export const MAIN_STAYS_TEXT = 'The main walls stay; pick a wing to remove it'

/** Whether a picked part still names a mass of a building in the plan. */
export function partExists(plan: Plan, p: PickedPart): boolean {
  const o = plan.objects[p.objectId]
  return !!o && o.type === 'house' && Number.isInteger(p.mass) && p.mass >= 0 && p.mass < buildingMasses(o.params).length
}

/** The picked part, or null when undo, a load or a removal has left it pointing at nothing. */
export function pickedPartOf(s: Pick<PlanState, 'plan' | 'pickedPart'>): PickedPart | null {
  return s.pickedPart && partExists(s.plan, s.pickedPart) ? s.pickedPart : null
}

export function partActions({ get, set, editable, edit, editRefit }: PartContext): PartActions {
  return {
    // moves, sizes and shapes go through editRefit, so wall openings a wing now covers are re-fitted
    updateWing: (id, mi, patch) => editRefit(id, (p) => withWing(p, mi, (w) => ({ ...w, ...patch }))),

    addWing: (id, wing) => {
      const o = editable(id)
      if (!o) return null
      if (wingSlots(o.params).length >= MAX_WINGS) {
        get().showToast(MAX_PARTS_TEXT)
        return null
      }
      const before = get().plan
      editRefit(id, (p) => withAddedWing(p, wing))
      return get().plan === before ? null : wingSlots(get().plan.objects[id].params).length
    },

    removeWing: (id, mi) => {
      if (mi < 1) {
        if (editable(id)) get().showToast(MAIN_STAYS_TEXT)
        return
      }
      const before = get().plan
      editRefit(id, (p) => withoutWing(p, mi))
      if (get().plan === before) return
      // view state keyed by this building's mass indices no longer points where it did (not an undo step)
      const s = get()
      set({
        pickedPart: s.pickedPart?.objectId === id ? null : s.pickedPart,
        openingFocus: s.openingFocus?.objectId === id ? null : s.openingFocus,
      })
    },

    setRail: (id, mi, edge, state) =>
      edit(id, (o) => {
        const deck = o.type === 'deck'
        if (deck && mi !== 0) throw new Error('a standalone deck is mass 0')
        const mass = buildingMasses(o.params)[mi]
        if (!mass) throw new Error(`no mass ${mi}`)
        const n = massPoly(mass).length
        const s = get()
        const draws = railDraws({ plan: s.plan, site: s.site, id, mass: mi })
        const usable = draws && draws.length === n ? draws : null
        const write = (src: Params): Params =>
          edge === 'all' ? writeAll(src, state, n, usable?.map((d) => d.free) ?? null) : writeEdge(src, edge, state, n, usable)
        return { ...o, params: deck ? write(o.params) : withWing(o.params, mi, write) }
      }),

    setRailStyle: (id, style) => {
      const o = get().plan.objects[id]
      if (o && buildingRailStyle(o.params) === style) return
      edit(id, (x) => ({ ...x, params: withRailStyle(x.params, style) }))
    },

    pickPart: (p) => {
      if (!p) return set({ pickedPart: null })
      if (!partExists(get().plan, p)) return
      set({ pickedPart: { objectId: p.objectId, mass: p.mass }, selection: [p.objectId] })
    },
  }
}

export type { RailState, RailStyle }
