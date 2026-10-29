import { create } from 'zustand'
import { temporal } from 'zundo'
import { loadIslandale } from '../site/islandale'
import { CURRENT_SCHEME_ID, loadSchemes, schemeById } from '../site/schemes'
import type { Site } from '../site/types'
import type { Scheme } from '../site/schemes'
import { planFromScheme } from './fromLegacy'
import { editCuts, massWalls, nextCutId, refitAll, withCutIds, type EditResult } from '../buildings/openingEdits'
import type { CutData, FitNote } from '../buildings/openingLayout'
import type { ViewId } from '../scene/views'
import { normalizeDeg } from '../site/units'
import { partActions, watchPickedPart, type PartActions } from './partActions'
import { isObjectLocked } from './selectors'
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_LAYERS,
  HOUR_RANGE,
  TIDE_RANGE_FT,
  type DisplayStyle,
  type Environment,
  type LabelMode,
  type LayerId,
  type LayerState,
  type Layers,
  type ObjectId,
  type Plan,
  type PlanObject,
} from './types'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'loading'

/** Why the plan cannot be edited in this tab, or null when it can. */
export type ReadOnlyReason = 'opening' | 'other-tab' | 'newer-file' | 'unsafe-save' | null

export interface OpeningFocus {
  readonly objectId: ObjectId
  readonly mass: number
  readonly cutId: number
}

/** One part of a building picked for editing: mass 0 is the main walls, mass n the n-th wing. */
export interface PickedPart {
  readonly objectId: ObjectId
  readonly mass: number
}

export interface Toast {
  readonly id: number
  readonly text: string
}

export interface PlanState extends PartActions {
  readonly site: Site
  readonly schemes: readonly Scheme[]
  readonly plan: Plan
  readonly selection: readonly ObjectId[]
  readonly hovered: ObjectId | null
  /** Terrain and lot are locked by default so the ground can never be dragged by accident. */
  readonly siteLocked: boolean
  readonly labelMode: LabelMode
  readonly layers: Layers
  readonly environment: Environment
  readonly displayStyle: DisplayStyle
  /** Contour lines: on, off, or null to follow the display style (off in Realistic). */
  readonly contours: boolean | null
  readonly saveStatus: SaveStatus
  readonly readOnly: ReadOnlyReason
  /** The opening picked in the Openings panel, outlined in 3D. */
  readonly openingFocus: OpeningFocus | null
  /** The building part picked for editing; read it through pickedPartOf, which checks it still exists. */
  readonly pickedPart: PickedPart | null
  readonly toast: Toast | null
  /** The last saved view asked for; `n` makes a repeat request fly again. */
  readonly viewRequest: { readonly id: ViewId; readonly n: number } | null

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
  // openings: mass 0 is the main walls, mass n the n-th wing; each is one undo step, refused when locked
  readonly addOpening: (id: ObjectId, massIndex: number, cut: CutData) => void
  readonly updateOpening: (id: ObjectId, massIndex: number, cutId: number, patch: Partial<CutData>) => void
  readonly removeOpening: (id: ObjectId, massIndex: number, cutId: number) => void
  readonly duplicateOpening: (id: ObjectId, massIndex: number, cutId: number) => void
  readonly centreOpening: (id: ObjectId, massIndex: number, cutId: number) => void
  /** Every other window on the mass takes this opening's head height. */
  readonly alignHeads: (id: ObjectId, massIndex: number, cutId: number) => void
  /** Fit every opening on a cabin by the rules (for saved schemes that break them). */
  readonly fitAllOpenings: (id: ObjectId) => void
  // --- view state: not undo steps -------------------------------------
  readonly select: (ids: readonly ObjectId[]) => void
  readonly toggleSelect: (id: ObjectId) => void
  readonly setHovered: (id: ObjectId | null) => void
  readonly setSiteLocked: (locked: boolean) => void
  readonly setLabelMode: (mode: LabelMode) => void
  readonly setLayer: (layer: LayerId, patch: Partial<LayerState>) => void
  readonly lockAll: (locked: boolean) => void
  readonly showAll: () => void
  readonly setEnvironment: (patch: Partial<Environment>) => void
  readonly setDisplayStyle: (style: DisplayStyle) => void
  readonly setContours: (contours: boolean | null) => void
  readonly requestView: (id: ViewId) => void
  readonly setSaveStatus: (status: SaveStatus) => void
  readonly setReadOnly: (reason: ReadOnlyReason) => void
  readonly setOpeningFocus: (focus: OpeningFocus | null) => void
  readonly showToast: (text: string) => void
  readonly hydrate: (saved: {
    plan: Plan
    labelMode?: LabelMode
    layers?: Layers
    environment?: Environment
    displayStyle?: DisplayStyle
    contours?: boolean | null
  }) => void
}

/** Params whose change can move a cabin's walls, so its openings are re-fitted. */
const SHAPE_KEYS = ['w', 'd', 'shape', 'pts', 'taper', 'skew', 'wings'] as const

const READ_ONLY_TEXT: Record<Exclude<ReadOnlyReason, null>, string> = {
  opening: 'The saved plan is still opening; try again in a moment',
  'other-tab': 'The plan is open for editing in another tab',
  'newer-file': 'This save is from a newer version of the planner; it opens read-only',
  'unsafe-save': 'The old save could not be set aside safely, so editing is off',
}

const site = loadIslandale()
const schemes = loadSchemes()
let toastSeq = 0

export const usePlanStore = create<PlanState>()(
  temporal(
    (set, get) => {
      /** False, with a toast, when this tab may not change the plan. */
      const writable = (): boolean => {
        const s = get()
        if (!s.readOnly) return true
        s.showToast(READ_ONLY_TEXT[s.readOnly])
        return false
      }
      /** The object when it may be changed; a read-only tab or a locked object shows a toast and gives null. */
      const editable = (id: ObjectId): PlanObject | null => {
        if (!writable()) return null
        const s = get()
        const o = s.plan.objects[id]
        if (!o) throw new Error(`unknown object "${id}"`)
        if (!isObjectLocked(s, id)) return o
        s.showToast(`${o.name} is locked`)
        return null
      }
      /** Apply an edit to one object unless it is locked; a locked object shows a toast instead. */
      const edit = (id: ObjectId, patch: (o: PlanObject) => PlanObject): void => {
        const o = editable(id)
        if (!o) return
        const s = get()
        set({ plan: { ...s.plan, objects: { ...s.plan.objects, [id]: patch(o) } } })
      }

      /** Change a cabin (where it stands too) and re-fit its openings, as one edit. */
      const refitObject = (id: ObjectId, change: (o: PlanObject) => PlanObject) => {
        let result: EditResult | null = null
        edit(id, (o) => {
          const next = change(o)
          result = refitAll(withCutIds(next.params))
          return { ...next, params: result.params }
        })
        if (result) reportFit((result as EditResult).notes)
      }
      const editRefit = (id: ObjectId, change: (p: Record<string, unknown>) => Record<string, unknown>) =>
        refitObject(id, (o) => ({ ...o, params: change(o.params) }))
      /** Change one mass's cuts; the fitted numbers are what is stored. */
      const editOpenings = (id: ObjectId, mi: number, change: (cuts: CutData[], p: Record<string, unknown>) => CutData[]) => {
        let result: EditResult | null = null
        edit(id, (o) => {
          const p = withCutIds(o.params)
          result = editCuts(p, mi, (cuts) => change(cuts, p))
          return { ...o, params: result.params }
        })
        if (result) reportFit((result as EditResult).notes)
      }
      const reportFit = (notes: readonly FitNote[]) => {
        const moved = new Set(notes.map((n) => n.id))
        if (moved.size === 1) get().showToast(`Opening ${notes[0].reason}`)
        else if (moved.size > 1) get().showToast(`${moved.size} openings fitted`)
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
        environment: DEFAULT_ENVIRONMENT,
        displayStyle: 'realistic',
        contours: null,
        saveStatus: 'loading',
        readOnly: null,
        openingFocus: null,
        pickedPart: null,
        toast: null,
        viewRequest: null,

        loadScheme: (schemeId) => {
          if (writable()) set({ plan: planFromScheme(schemeById(get().schemes, schemeId)), selection: [], pickedPart: null })
        },
        replacePlan: (plan) => {
          if (writable()) set({ plan, selection: [], pickedPart: null })
        },
        moveObject: (id, position) => edit(id, (o) => ({ ...o, position: { ...position } })),
        rotateObject: (id, rotation) => edit(id, (o) => ({ ...o, rotation: normalizeDeg(rotation) })),
        transformObject: (id, t) =>
          edit(id, (o) => ({
            ...o,
            position: t.position ? { ...t.position } : o.position,
            rotation: t.rotation === undefined ? o.rotation : normalizeDeg(t.rotation),
          })),
        nudgeObjects: (ids, dx, dn) => {
          if (!writable()) return
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
        // a new size or shape re-fits the cabin's openings in the same undo step
        resizeObject: (id, { w, d }) => editRefit(id, (p) => ({ ...p, w: Math.max(1, w), d: Math.max(1, d) })),
        setObjectParams: (id, patch) =>
          SHAPE_KEYS.some((k) => k in patch) ? editRefit(id, (p) => ({ ...p, ...patch })) : edit(id, (o) => ({ ...o, params: { ...o.params, ...patch } })),
        renameObject: (id, name) => edit(id, (o) => ({ ...o, name })),
        deleteObjects: (ids) => {
          if (!writable()) return
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
            pickedPart: s.pickedPart && gone.has(s.pickedPart.objectId) ? null : s.pickedPart,
          })
        },
        // Locking is allowed on a locked object (it is how you unlock), so it bypasses `edit`.
        setLocked: (id, locked) => {
          if (writable()) set((s) => ({ plan: withObject(s.plan, id, { locked }) }))
        },
        setHidden: (id, hidden) => {
          if (writable()) set((s) => ({ plan: withObject(s.plan, id, { hidden }) }))
        },
        setLabelVisible: (id, labelVisible) => {
          if (writable()) set((s) => ({ plan: withObject(s.plan, id, { labelVisible }) }))
        },

        addOpening: (id, mi, cut) =>
          editOpenings(id, mi, (cuts, p) => [...cuts, { ...cut, id: nextCutId(p) }]),
        updateOpening: (id, mi, cutId, patch) =>
          editOpenings(id, mi, (cuts) => cuts.map((c) => (c.id === cutId ? { ...c, ...patch, id: cutId } : c))),
        removeOpening: (id, mi, cutId) => editOpenings(id, mi, (cuts) => cuts.filter((c) => c.id !== cutId)),
        duplicateOpening: (id, mi, cutId) =>
          editOpenings(id, mi, (cuts, p) => {
            const c = cuts.find((x) => x.id === cutId)
            // the copy goes just to the right (seen from outside); the fit slides it along if that is taken
            return c ? [...cuts, { ...c, id: nextCutId(p), x: (c.x ?? 0) + (c.w ?? 3) + 1 }] : cuts
          }),
        centreOpening: (id, mi, cutId) =>
          editOpenings(id, mi, (cuts, p) =>
            cuts.map((c) => {
              if (c.id !== cutId || c.along) return c
              const wall = massWalls(p, mi).find((w) => w.edge === c.edge)
              return wall ? { ...c, x: (wall.lengthFt - (c.w ?? 3)) / 2 } : c
            }),
          ),
        alignHeads: (id, mi, cutId) =>
          editOpenings(id, mi, (cuts) => {
            const ref = cuts.find((c) => c.id === cutId)
            if (!ref) return cuts
            const head = (ref.sill ?? 0) + (ref.h ?? 4)
            return cuts.map((c) => {
              if (c.id === cutId) return c
              if (c.kind === 'door' || c.kind === 'slider') return { ...c, h: head - (c.sill ?? 0) }
              return { ...c, sill: Math.max(0, head - (c.h ?? 4)) }
            })
          }),
        fitAllOpenings: (id) => editRefit(id, (p) => p),
        ...partActions({ get, set, editable, edit, editRefit, refitObject }),

        // the picked part survives only a selection of exactly its own building
        select: (ids) =>
          set((s) => ({
            selection: [...ids],
            pickedPart: s.pickedPart && ids.length === 1 && ids[0] === s.pickedPart.objectId ? s.pickedPart : null,
          })),
        toggleSelect: (id) =>
          set((s) => ({
            selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id],
            pickedPart: null,
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
        setEnvironment: (patch) => set((s) => ({ environment: clampEnvironment({ ...s.environment, ...patch }) })),
        setDisplayStyle: (displayStyle) => set({ displayStyle }),
        setContours: (contours) => set({ contours }),
        requestView: (id) => set((s) => ({ viewRequest: { id, n: (s.viewRequest?.n ?? 0) + 1 } })),
        setSaveStatus: (saveStatus) => set({ saveStatus }),
        setReadOnly: (readOnly) => set({ readOnly }),
        setOpeningFocus: (openingFocus) => set({ openingFocus }),
        showToast: (text) => set({ toast: { id: ++toastSeq, text } }),
        hydrate: ({ plan, labelMode, layers, environment, displayStyle, contours }) =>
          set({
            plan,
            labelMode: labelMode ?? get().labelMode,
            layers: layers ?? get().layers,
            environment: environment ? clampEnvironment(environment) : get().environment,
            displayStyle: displayStyle ?? get().displayStyle,
            contours: contours === undefined ? get().contours : contours,
            selection: [],
            pickedPart: null,
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

watchPickedPart(usePlanStore)

export { pickedPartOf } from './partActions'
export { contoursShown, isLabelShown, isObjectLocked, isObjectVisible } from './selectors'

function withObject(plan: Plan, id: ObjectId, patch: Partial<PlanObject>): Plan {
  const existing = plan.objects[id]
  if (!existing) throw new Error(`unknown object "${id}"`)
  return { ...plan, objects: { ...plan.objects, [id]: { ...existing, ...patch } } }
}

function mapLayers(layers: Layers, f: (l: LayerState) => LayerState): Layers {
  return Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, f(v)])) as Layers
}

export function clampEnvironment(e: Environment): Environment {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  return {
    season: e.season,
    hour: clamp(e.hour, HOUR_RANGE.min, HOUR_RANGE.max),
    tideFt: clamp(e.tideFt, TIDE_RANGE_FT.min, TIDE_RANGE_FT.max),
  }
}
