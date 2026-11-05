import { libraryItem, buildLibraryObject } from '../tools/library'
import { snapDeg, snapPoint } from '../tools/snap'
import type { Ground } from '../paths/pieces'
import type { Terrain } from '../site/types'
import { elevationAt } from '../site/terrain'
import { ftToM, FT_PER_M, normalizeDeg } from '../site/units'
import { freshId, freshName, withObjectPut } from './ids'
import { settledPiece } from './pathActions'
import type { PlanState } from './planStore'
import { LAYER_NAMES, layerOf, type ObjectId, type Plan, type PlanObject } from './types'

/**
 * The tools of the plan store (4A): one current tool, the Snap toggle,
 * placing from the object library, duplicate, and turning the selection.
 *
 * The tool is read from what each tool holds (the item being placed, Paint
 * mode, the Connect ends), and the setters keep only one of them at a time,
 * so `toolOf` is the one place that says which tool is on. Switching tools
 * is view state; placing, duplicating and turning are each one undo step,
 * refused on a read-only tab or a locked layer.
 */

export type ToolId = 'select' | 'place' | 'paint' | 'connect'

/** Duplicates land this far east and this far south of the original (old planner: 5 ft). */
const DUPLICATE_OFFSET_FT = 5

export function toolOf(s: Pick<PlanState, 'placing' | 'painting' | 'connecting'>): ToolId {
  if (s.placing) return 'place'
  if (s.painting) return 'paint'
  if (s.connecting) return 'connect'
  return 'select'
}

export interface ToolActions {
  /** Switch to a tool, ending whichever was on; Place needs the library item to place. */
  readonly setTool: (tool: ToolId, item?: string) => void
  readonly setSnap: (on: boolean) => void
  /** Put a library item down at a site point (snapped when Snap is on) as one undo step; it becomes the selection and the tool goes back to Select. */
  readonly placeItem: (itemId: string, at: { x: number; n: number }, rotation: number) => ObjectId | null
  /** Copy objects 5 ft east and south as one undo step and select the copies; refused whole if any is on a locked layer. */
  readonly duplicateObjects: (ids: readonly ObjectId[]) => ObjectId[]
  /** Turn objects by `byDeg` about their own centres as one undo step; locked ones stay put. */
  readonly turnObjects: (ids: readonly ObjectId[], byDeg: number) => void
}

export interface ToolContext {
  readonly get: () => PlanState
  readonly set: (partial: Partial<PlanState>) => void
  readonly writable: () => boolean
  readonly isLocked: (id: ObjectId) => boolean
  readonly terrain: Terrain
  readonly ground: Ground
}

const CONNECT_START = { A: null, B: null, widthFt: 4 } as const

export function toolActions({ get, set, writable, isLocked, terrain, ground }: ToolContext): ToolActions {
  const layerLocked = (o: Pick<PlanObject, 'type' | 'params'>): string | null => {
    const layer = layerOf(o)
    return get().layers[layer].locked ? `${LAYER_NAMES[layer]} are locked` : null
  }

  return {
    setTool: (tool, item) => {
      const s = get()
      if (tool === 'place') {
        if (!item) throw new Error('setTool("place") needs a library item')
        libraryItem(item)
        s.setPlacing({ item, rotation: 0, at: null })
      } else if (tool === 'paint') s.setPainting(true)
      else if (tool === 'connect') s.setConnecting({ ...CONNECT_START })
      else set({ placing: null, painting: false, connecting: null })
    },
    setSnap: (snap) => set({ snap }),

    placeItem: (itemId, at, rotation) => {
      if (!writable()) return null
      const s = get()
      const item = libraryItem(itemId)
      const spot = s.snap ? snapPoint(at) : { x: at.x, n: at.n }
      const turn = s.snap ? snapDeg(rotation) : normalizeDeg(rotation)
      if (item.pathKind) {
        set({ placing: null })
        return s.addPathPiece(item.pathKind, spot, turn)
      }
      const refused = layerLocked(item)
      if (refused) {
        s.showToast(refused)
        return null
      }
      const o = buildLibraryObject(item, {
        id: freshId(s.plan, 'obj'),
        name: freshName(s.plan, item.name),
        at: spot,
        rotation: turn,
        groundFt: (x, n) => elevationAt(terrain, x, n) * FT_PER_M,
      })
      set({ plan: withObjectPut(s.plan, o), selection: [o.id], pickedPart: null, placing: null })
      return o.id
    },

    duplicateObjects: (ids) => {
      if (!writable()) return []
      const s = get()
      const sources = ids.map((id) => s.plan.objects[id]).filter((o): o is PlanObject => !!o)
      const refused = sources.map(layerLocked).find(Boolean)
      if (refused) {
        s.showToast(refused)
        return []
      }
      if (!sources.length) return []
      const dx = ftToM(DUPLICATE_OFFSET_FT)
      let plan: Plan = s.plan
      const copies: ObjectId[] = []
      for (const src of sources) {
        const moved: PlanObject = {
          ...src,
          id: freshId(plan, 'obj'),
          name: freshName(plan, src.name),
          position: { x: src.position.x + dx, n: src.position.n - dx },
          params: structuredClone(src.params) as Record<string, unknown>,
          locked: false,
          hidden: false,
        }
        const copy = settledPiece(moved, plan, terrain, ground)
        plan = withObjectPut(plan, copy)
        copies.push(copy.id)
      }
      set({ plan, selection: copies, pickedPart: null })
      return copies
    },

    turnObjects: (ids, byDeg) => {
      if (!writable()) return
      const s = get()
      const turnable = ids.filter((id) => s.plan.objects[id] && !isLocked(id))
      if (turnable.length < ids.length) s.showToast(ids.length === 1 ? `${s.plan.objects[ids[0]]?.name ?? 'Object'} is locked` : 'Some objects are locked')
      if (!turnable.length) return
      const objects = { ...s.plan.objects }
      for (const id of turnable) {
        const o = objects[id]
        objects[id] = settledPiece({ ...o, rotation: normalizeDeg(o.rotation + byDeg) }, s.plan, terrain, ground)
      }
      set({ plan: { ...s.plan, objects } })
    },
  }
}
