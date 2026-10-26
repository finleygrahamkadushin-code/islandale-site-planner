import { create } from 'zustand'
import { temporal } from 'zundo'
import { loadIslandale } from '../site/islandale'
import { CURRENT_SCHEME_ID, loadSchemes, schemeById } from '../site/schemes'
import type { Site } from '../site/types'
import type { Scheme } from '../site/schemes'
import { planFromScheme } from './fromLegacy'
import {
  DEFAULT_LAYERS,
  layerOf,
  type LabelMode,
  type LayerId,
  type LayerState,
  type Layers,
  type ObjectId,
  type Plan,
  type PlanObject,
} from './types'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'loading'

export interface Toast {
  readonly id: number
  readonly text: string
}

export interface PlanState {
  readonly site: Site
  readonly schemes: readonly Scheme[]
  readonly plan: Plan
  readonly selection: readonly ObjectId[]
  readonly hovered: ObjectId | null
  /** Terrain and lot are locked by default so the ground can never be dragged by accident. */
  readonly siteLocked: boolean
  readonly labelMode: LabelMode
  readonly layers: Layers
  readonly saveStatus: SaveStatus
  readonly toast: Toast | null

  // --- undoable: everything that changes `plan` -------------------------
  readonly loadScheme: (schemeId: string) => void
  readonly replacePlan: (plan: Plan) => void
  readonly moveObject: (id: ObjectId, position: { x: number; n: number }) => void
  readonly rotateObject: (id: ObjectId, rotation: number) => void
  /** Move and rotate together as one undo step (the end of a gizmo drag). */
  readonly transformObject: (id: ObjectId, t: { position?: { x: number; n: number }; rotation?: number }) => void
  /** Shift several objects by the same offset (metres) as one undo step; locked ones stay put. */
  readonly nudgeObjects: (ids: readonly ObjectId[], dx: number, dn: number) => void
  readonly resizeObject: (id: ObjectId, size: { w: number; d: number }) => void
  readonly setObjectParams: (id: ObjectId, patch: Record<string, unknown>) => void
  readonly renameObject: (id: ObjectId, name: string) => void
  readonly deleteObjects: (ids: readonly ObjectId[]) => void
  readonly setLocked: (id: ObjectId, locked: boolean) => void
  readonly setHidden: (id: ObjectId, hidden: boolean) => void
  readonly setLabelVisible: (id: ObjectId, visible: boolean) => void

  // --- view state: not undo steps -------------------------------------
  readonly select: (ids: readonly ObjectId[]) => void
  readonly toggleSelect: (id: ObjectId) => void
  readonly setHovered: (id: ObjectId | null) => void
  readonly setSiteLocked: (locked: boolean) => void
  readonly setLabelMode: (mode: LabelMode) => void
  readonly setLayer: (layer: LayerId, patch: Partial<LayerState>) => void
  readonly lockAll: (locked: boolean) => void
  readonly showAll: () => void
  readonly setSaveStatus: (status: SaveStatus) => void
  readonly showToast: (text: string) => void
  readonly hydrate: (saved: { plan: Plan; labelMode?: LabelMode; layers?: Layers }) => void
}

const site = loadIslandale()
const schemes = loadSchemes()
let toastSeq = 0

export const usePlanStore = create<PlanState>()(
  temporal(
    (set, get) => {
      /** Apply an edit to one object unless it is locked; a locked object shows a toast instead. */
      const edit = (id: ObjectId, patch: (o: PlanObject) => PlanObject): void => {
        const s = get()
        const o = s.plan.objects[id]
        if (!o) throw new Error(`unknown object "${id}"`)
        if (isObjectLocked(s, id)) {
          s.showToast(`${o.name} is locked`)
          return
        }
        set({ plan: { ...s.plan, objects: { ...s.plan.objects, [id]: patch(o) } } })
      }

      return {
        site,
        schemes,
        plan: planFromScheme(schemeById(schemes, CURRENT_SCHEME_ID)),
        selection: [],
        hovered: null,
        siteLocked: true,
        labelMode: 'all',
        layers: DEFAULT_LAYERS,
        saveStatus: 'loading',
        toast: null,

        loadScheme: (schemeId) =>
          set({ plan: planFromScheme(schemeById(get().schemes, schemeId)), selection: [] }),
        replacePlan: (plan) => set({ plan, selection: [] }),
        moveObject: (id, position) => edit(id, (o) => ({ ...o, position: { ...position } })),
        rotateObject: (id, rotation) => edit(id, (o) => ({ ...o, rotation: normalizeDeg(rotation) })),
        transformObject: (id, t) =>
          edit(id, (o) => ({
            ...o,
            position: t.position ? { ...t.position } : o.position,
            rotation: t.rotation === undefined ? o.rotation : normalizeDeg(t.rotation),
          })),
        nudgeObjects: (ids, dx, dn) => {
          const s = get()
          const movable = ids.filter((id) => s.plan.objects[id] && !isObjectLocked(s, id))
          if (movable.length < ids.length) s.showToast(ids.length === 1 ? `${s.plan.objects[ids[0]]?.name ?? 'Object'} is locked` : 'Some objects are locked')
          if (!movable.length) return
          const objects = { ...s.plan.objects }
          for (const id of movable) {
            const o = objects[id]
            objects[id] = { ...o, position: { x: o.position.x + dx, n: o.position.n + dn } }
          }
          set({ plan: { ...s.plan, objects } })
        },
        resizeObject: (id, { w, d }) =>
          edit(id, (o) => ({ ...o, params: { ...o.params, w: Math.max(1, w), d: Math.max(1, d) } })),
        setObjectParams: (id, patch) => edit(id, (o) => ({ ...o, params: { ...o.params, ...patch } })),
        renameObject: (id, name) => edit(id, (o) => ({ ...o, name })),
        deleteObjects: (ids) => {
          const s = get()
          const deletable = ids.filter((id) => s.plan.objects[id] && !isObjectLocked(s, id))
          const refused = ids.length - deletable.length
          if (refused > 0) s.showToast(refused === 1 ? 'That object is locked' : `${refused} objects are locked`)
          if (!deletable.length) return
          const gone = new Set(deletable)
          const objects = Object.fromEntries(Object.entries(s.plan.objects).filter(([id]) => !gone.has(id)))
          set({
            plan: { ...s.plan, objects, order: s.plan.order.filter((id) => !gone.has(id)) },
            selection: s.selection.filter((id) => !gone.has(id)),
          })
        },
        // Locking is allowed on a locked object (it is how you unlock), so it bypasses `edit`.
        setLocked: (id, locked) => set((s) => ({ plan: withObject(s.plan, id, { locked }) })),
        setHidden: (id, hidden) => set((s) => ({ plan: withObject(s.plan, id, { hidden }) })),
        setLabelVisible: (id, labelVisible) => set((s) => ({ plan: withObject(s.plan, id, { labelVisible }) })),

        select: (ids) => set({ selection: [...ids] }),
        toggleSelect: (id) =>
          set((s) => ({
            selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id],
          })),
        setHovered: (hovered) => set({ hovered }),
        setSiteLocked: (siteLocked) => set({ siteLocked }),
        setLabelMode: (labelMode) => set({ labelMode }),
        setLayer: (layer, patch) =>
          set((s) => ({ layers: { ...s.layers, [layer]: { ...s.layers[layer], ...patch } } })),
        lockAll: (locked) =>
          set((s) => ({
            layers: mapLayers(s.layers, (l) => ({ ...l, locked })),
          })),
        showAll: () => set((s) => ({ layers: mapLayers(s.layers, (l) => ({ ...l, visible: true })) })),
        setSaveStatus: (saveStatus) => set({ saveStatus }),
        showToast: (text) => set({ toast: { id: ++toastSeq, text } }),
        hydrate: ({ plan, labelMode, layers }) =>
          set({
            plan,
            labelMode: labelMode ?? get().labelMode,
            layers: layers ?? get().layers,
            selection: [],
          }),
      }
    },
    {
      // Only the plan itself is undoable; selection and view settings are not.
      partialize: (s) => ({ plan: s.plan }),
      equality: (a, b) => a.plan === b.plan,
    },
  ),
)

export const useTemporalStore = usePlanStore.temporal

/** Locked by its own padlock or by its layer's padlock. */
export function isObjectLocked(s: Pick<PlanState, 'plan' | 'layers'>, id: ObjectId): boolean {
  const o = s.plan.objects[id]
  if (!o) return false
  return o.locked || s.layers[layerOf(o)].locked
}

/** Hidden by itself or by its layer. */
export function isObjectVisible(s: Pick<PlanState, 'plan' | 'layers'>, id: ObjectId): boolean {
  const o = s.plan.objects[id]
  if (!o) return false
  return !o.hidden && s.layers[layerOf(o)].visible
}

/** Whether a label should show for this object under the current label mode. */
export function isLabelShown(s: Pick<PlanState, 'plan' | 'layers' | 'labelMode' | 'selection'>, id: ObjectId): boolean {
  const o = s.plan.objects[id]
  if (!o || !o.labelVisible || !s.layers.labels.visible || !isObjectVisible(s, id)) return false
  if (s.labelMode === 'none') return false
  if (s.labelMode === 'selected') return s.selection.includes(id)
  return true
}

function withObject(plan: Plan, id: ObjectId, patch: Partial<PlanObject>): Plan {
  const existing = plan.objects[id]
  if (!existing) throw new Error(`unknown object "${id}"`)
  return { ...plan, objects: { ...plan.objects, [id]: { ...existing, ...patch } } }
}

function mapLayers(layers: Layers, f: (l: LayerState) => LayerState): Layers {
  return Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, f(v)])) as Layers
}

export function normalizeDeg(deg: number): number {
  const d = ((deg % 360) + 360) % 360
  return d > 180 ? d - 360 : d
}
