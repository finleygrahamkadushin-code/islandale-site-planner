import { create } from 'zustand'
import { temporal } from 'zundo'
import { loadIslandale } from '../site/islandale'
import { elevationAt } from '../site/terrain'
import { CURRENT_SCHEME_ID, loadSchemes, schemeById } from '../site/schemes'
import type { Site } from '../site/types'
import type { Scheme } from '../site/schemes'
import { planFromScheme } from './fromLegacy'
import { editCuts, massWalls, nextCutId, refitAll, withCutIds, type EditResult } from '../buildings/openings/openingEdits'
import { withSize } from '../buildings/parts/wingEdits'
import type { CutData, FitNote } from '../buildings/openings/openingLayout'
import type { ViewId } from '../scene/views'
import { normalizeDeg } from '../site/units'
import { partActions, watchPickedPart, type PartActions } from './partActions'
import { interiorActions, type InteriorActions } from './interiorActions'
import { pathActions, settledPiece, snappedPiece, type PathActions } from './pathActions'
import { toolActions, type ToolActions } from './toolActions'
import type { Measurement, MeasurePoint } from '../tools/measure'
import type { DisplayOptions, DisplayToggle } from '../scene/displayOptions'
import type { PaintFocus, PaintScope } from './paintTypes'
import type { SnapTarget } from '../paths/targets'
import { isObjectLocked } from './selectors'

/** Name a cleared plan takes. */
export const BLANK_PLAN_NAME = 'Blank plan'
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_SETBACKS,
  SETBACK_RANGES,
  DEFAULT_LAYERS,
  HOUR_RANGE,
  TIDE_RANGE_FT,
  type DisplayStyle,
  type Environment,
  type Setbacks,
  type LabelMode,
  type LayerId,
  type LayerState,
  type Layers,
  type ObjectId,
  type Plan,
  type PlanObject,
  layerOf,
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
  /** One rail of the part picked in 3D (its edge), for Remove rail and Join. */
  readonly rail?: number
}

export interface Toast {
  readonly id: number
  readonly text: string
}

export interface PlanState extends PartActions, InteriorActions, PathActions, ToolActions {
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
  /** Site rules (5E): saved with the plan, not undone. */
  readonly setbacks: Setbacks
  readonly displayStyle: DisplayStyle
  /** Occlusion, shadows and edges switched away from the style's defaults (saved, not undone; see effectiveDisplay). */
  readonly displayOptions: DisplayOptions
  /** Contour lines: on, off, or null to follow the display style (off in Realistic). */
  readonly contours: boolean | null
  /** Hide every roof so the rooms inside can be seen (old Roofs off). View state, not saved. */
  readonly roofsOff: boolean
  /** Paint mode (P): a click in 3D picks the element the Exterior panel paints. */
  readonly painting: boolean
  /** The element the Exterior panel works on, and how far a change reaches. */
  readonly paintFocus: PaintFocus | null
  readonly paintScope: PaintScope
  /** The Place tool: the library item being placed, its turn, and where the ghost is (view state; see toolOf). */
  readonly placing: { readonly item: string; readonly rotation: number; readonly at: { readonly x: number; readonly n: number } | null } | null
  /** Moves land on a 1 ft grid and turns on 5° steps (view state, on by default). */
  readonly snap: boolean
  /** The Measure tool: its first point once picked (view state; see toolOf). */
  readonly measuring: { readonly a: MeasurePoint | null } | null
  /** The last few measurements, kept on screen until Clear (view state). */
  readonly measurements: readonly Measurement[]
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
  /** Remove every object not locked (by itself or its layer), one undo step. The terrain and lot stay. */
  readonly clearPlan: () => void
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
  /** Change a building's or deck's exterior finishes (params.ext and the scheme finish fields) as one undo step, refused when locked. */
  readonly editExterior: (id: ObjectId, change: (params: Record<string, unknown>) => Record<string, unknown>) => void
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
  readonly setSetbacks: (patch: Partial<Setbacks>) => void
  readonly setDisplayStyle: (style: DisplayStyle) => void
  readonly setDisplayOption: (toggle: DisplayToggle, on: boolean) => void
  readonly setContours: (contours: boolean | null) => void
  readonly setRoofsOff: (roofsOff: boolean) => void
  readonly setPainting: (painting: boolean) => void
  readonly setPaintFocus: (focus: PaintFocus | null) => void
  readonly setPaintScope: (scope: PaintScope) => void
  readonly setPlacing: (placing: PlanState['placing']) => void
  /** The Connect tool (C): the two ends picked so far and the width to build at (view state). */
  readonly connecting: { readonly A: SnapTarget | null; readonly B: SnapTarget | null; readonly widthFt: number } | null
  readonly setConnecting: (connecting: PlanState['connecting']) => void
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
    setbacks?: Setbacks
    displayStyle?: DisplayStyle
    contours?: boolean | null
    displayOptions?: DisplayOptions
  }) => void
}

/** Params whose change can move a cabin's walls, so its openings are re-fitted. */
const SHAPE_KEYS = ['w', 'd', 'shape', 'pts', 'taper', 'skew', 'bend', 'point', 'wings'] as const

const READ_ONLY_TEXT: Record<Exclude<ReadOnlyReason, null>, string> = {
  opening: 'The saved plan is still opening; try again in a moment',
  'other-tab': 'The plan is open for editing in another tab',
  'newer-file': 'This save is from a newer version of the planner; it opens read-only',
  'unsafe-save': 'The old save could not be set aside safely, so editing is off',
}

const site = loadIslandale()
/** The surveyed ground, for snapping path pieces (the scene draws cuts on top of it). */
const siteGround = (x: number, n: number) => elevationAt(site.terrain, x, n)
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

      /** A path piece after a hand move (snapped) or turn (its end levels settled); anything else as it is. */
      const snapMoved = (o: PlanObject, moved: boolean): PlanObject => {
        const plan = get().plan
        if (!moved) return settledPiece(o, plan, site.terrain, siteGround)
        const r = snappedPiece(o, plan, site.terrain, siteGround)
        if (r.snap) get().showToast(`Snapped: ${r.snap.end} → ${r.snap.target.label}`)
        return r.o
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
        setbacks: DEFAULT_SETBACKS,
        displayStyle: 'realistic',
        displayOptions: {},
        contours: null,
        roofsOff: false,
        painting: false,
        paintFocus: null,
        paintScope: 'element',
        placing: null,
        snap: true,
        measuring: null,
        measurements: [],
        connecting: null,
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
        clearPlan: () => {
          if (!writable()) return
          const s = get()
          const kept = s.plan.order.filter((id) => isObjectLocked(s, id))
          const keep = new Set(kept)
          const objects = Object.fromEntries(Object.entries(s.plan.objects).filter(([id]) => keep.has(id)))
          set({ plan: { ...s.plan, name: BLANK_PLAN_NAME, schemeId: null, objects, order: kept }, selection: [], pickedPart: null })
          s.showToast(kept.length ? `Plan cleared. ${kept.length} locked ${kept.length === 1 ? 'object' : 'objects'} kept.` : 'Plan cleared')
        },
        // a path piece moved by hand snaps to what it lands on; turned, its end levels follow what it touches
        moveObject: (id, position) => edit(id, (o) => snapMoved({ ...o, position: { ...position } }, true)),
        rotateObject: (id, rotation) => edit(id, (o) => snapMoved({ ...o, rotation: normalizeDeg(rotation) }, false)),
        transformObject: (id, t) =>
          edit(id, (o) =>
            snapMoved(
              {
                ...o,
                position: t.position ? { ...t.position } : o.position,
                rotation: t.rotation === undefined ? o.rotation : normalizeDeg(t.rotation),
              },
              !!t.position,
            ),
          ),
        nudgeObjects: (ids, dx, dn) => {
          if (!writable()) return
          const s = get()
          const movable = ids.filter((id) => s.plan.objects[id] && !isObjectLocked(s, id))
          if (movable.length < ids.length) s.showToast(ids.length === 1 ? `${s.plan.objects[ids[0]]?.name ?? 'Object'} is locked` : 'Some objects are locked')
          if (!movable.length) return
          const objects = { ...s.plan.objects }
          for (const id of movable) {
            const o = objects[id]
            objects[id] = settledPiece({ ...o, position: { x: o.position.x + dx, n: o.position.n + dn } }, s.plan, site.terrain, siteGround)
          }
          set({ plan: { ...s.plan, objects } })
        },
        // a new size or shape re-fits the cabin's openings in the same undo step; a poly or blob's points scale with it
        resizeObject: (id, { w, d }) => editRefit(id, (p) => withSize(p, Math.max(1, w), Math.max(1, d))),
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
        // a hidden object is gone from the view, so it leaves the selection and drops its picked part
        setHidden: (id, hidden) => {
          if (!writable()) return
          set((s) => ({
            plan: withObject(s.plan, id, { hidden }),
            selection: hidden ? s.selection.filter((x) => x !== id) : s.selection,
            pickedPart: hidden && s.pickedPart?.objectId === id ? null : s.pickedPart,
          }))
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
        editExterior: (id, change) => {
          const o = get().plan.objects[id]
          // a change that changes nothing is no undo step
          if (o && JSON.stringify(change(o.params)) !== JSON.stringify(o.params)) edit(id, (cur) => ({ ...cur, params: change(cur.params) }))
        },
        fitAllOpenings: (id) => editRefit(id, (p) => p),
        ...partActions({ get, set, editable, edit, editRefit, refitObject }),
        ...interiorActions({ get, editable, edit }),
        ...pathActions({ get, set, writable, editable, isLocked: (id) => isObjectLocked(get(), id), terrain: site.terrain, ground: siteGround }),
        ...toolActions({ get, set, writable, isLocked: (id) => isObjectLocked(get(), id), terrain: site.terrain, ground: siteGround }),

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
        // as with setHidden, objects on a layer that goes hidden leave the selection and drop their picked part
        setLayer: (layer, patch) =>
          set((s) => {
            const layers = { ...s.layers, [layer]: { ...s.layers[layer], ...patch } }
            if (patch.visible !== false) return { layers }
            const shown = (id: ObjectId) => {
              const o = s.plan.objects[id]
              return !o || layerOf(o) !== layer
            }
            return {
              layers,
              selection: s.selection.filter(shown),
              pickedPart: s.pickedPart && !shown(s.pickedPart.objectId) ? null : s.pickedPart,
            }
          }),
        lockAll: (locked) =>
          set((s) => ({
            layers: mapLayers(s.layers, (l) => ({ ...l, locked })),
          })),
        showAll: () => set((s) => ({ layers: mapLayers(s.layers, (l) => ({ ...l, visible: true })) })),
        setEnvironment: (patch) => set((s) => ({ environment: clampEnvironment({ ...s.environment, ...patch }) })),
        setSetbacks: (patch) => set((s) => ({ setbacks: clampSetbacks({ ...s.setbacks, ...patch }) })),
        // a new style starts from its own defaults
        setDisplayStyle: (displayStyle) => set({ displayStyle, displayOptions: {} }),
        setDisplayOption: (toggle, on) => set((s) => ({ displayOptions: { ...s.displayOptions, [toggle]: on } })),
        setContours: (contours) => set({ contours }),
        setRoofsOff: (roofsOff) => set({ roofsOff }),
        // one tool at a time (toolOf): starting Paint, Place or Connect ends the other two
        setPainting: (painting) => set(painting ? { painting, placing: null, connecting: null, measuring: null } : { painting }),
        setPaintFocus: (paintFocus) => set({ paintFocus }),
        setPaintScope: (paintScope) => set({ paintScope }),
        setPlacing: (placing) => set(placing ? { placing, painting: false, connecting: null, measuring: null } : { placing }),
        setConnecting: (connecting) =>
          set(connecting ? { connecting, placing: null, painting: false, measuring: null, selection: [], pickedPart: null } : { connecting }),
        requestView: (id) => set((s) => ({ viewRequest: { id, n: (s.viewRequest?.n ?? 0) + 1 } })),
        setSaveStatus: (saveStatus) => set({ saveStatus }),
        setReadOnly: (readOnly) => set({ readOnly }),
        setOpeningFocus: (openingFocus) => set({ openingFocus }),
        showToast: (text) => set({ toast: { id: ++toastSeq, text } }),
        hydrate: ({ plan, labelMode, layers, environment, setbacks, displayStyle, displayOptions, contours }) =>
          set({
            plan,
            labelMode: labelMode ?? get().labelMode,
            layers: layers ?? get().layers,
            environment: environment ? clampEnvironment(environment) : get().environment,
            setbacks: setbacks ? clampSetbacks(setbacks) : get().setbacks,
            displayStyle: displayStyle ?? get().displayStyle,
            contours: contours === undefined ? get().contours : contours,
            displayOptions: displayOptions ?? get().displayOptions,
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

/** Snap each setback to its slider's step and keep it in range. */
export function clampSetbacks(b: Setbacks): Setbacks {
  const fit = (v: number, r: { min: number; max: number; step: number }, dflt: number) =>
    Number.isFinite(v) ? Math.max(r.min, Math.min(r.max, Math.round(v / r.step) * r.step)) : dflt
  return {
    shoreFt: fit(b.shoreFt, SETBACK_RANGES.shoreFt, DEFAULT_SETBACKS.shoreFt),
    bankFt: fit(b.bankFt, SETBACK_RANGES.bankFt, DEFAULT_SETBACKS.bankFt),
    sideFt: fit(b.sideFt, SETBACK_RANGES.sideFt, DEFAULT_SETBACKS.sideFt),
    treeZones: b.treeZones !== false,
    shown: b.shown !== false,
  }
}
