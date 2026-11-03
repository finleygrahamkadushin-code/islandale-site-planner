import { num } from '../buildings/footprint'
import { refreshedEnds, snapSolve, type SnapResult } from '../paths/snap'
import { DEFAULT_LENGTH, DEFAULT_SURFACE, DEFAULT_WIDTH, isPathPiece, pieceEnds, SURFACE_COLORS, type Ground, type PathKind } from '../paths/pieces'
import { isSnappable, snapTargets } from '../paths/targets'
import type { Terrain } from '../site/types'
import type { PlanState } from './planStore'
import type { ObjectId, Plan, PlanObject } from './types'

/**
 * Path-piece actions of the plan store (5C): add a piece (snapped to what
 * it lands on), change its settings with its snapped end held, continue
 * from an end, and add or change several objects at once (Connect, Fix,
 * Level everything, Auto route). Each is one undo step, refused on a
 * read-only tab or a locked object.
 */

const FT = 0.3048

/** The old library's new pieces: name, size (ft) and settings. */
export const PIECE_LIBRARY: Readonly<Record<PathKind, { readonly name: string; readonly params: Record<string, unknown> }>> = {
  walk: { name: 'Walk', params: { kind: 'walk', surface: 'gravel', w: 20, d: 4, h: 0.2, color: SURFACE_COLORS.gravel } },
  ramp: { name: 'Ramp', params: { kind: 'ramp', surface: 'concrete', w: 12, d: 4, h: 0.2, color: SURFACE_COLORS.concrete } },
  stair: { name: 'Steps', params: { kind: 'stair', surface: 'concrete', w: 8, d: 4, h: 0.2, color: SURFACE_COLORS.concrete } },
  landing: { name: 'Landing', params: { kind: 'landing', surface: 'concrete', w: 5, d: 5, h: 0.2, color: SURFACE_COLORS.concrete } },
  boardwalk: { name: 'Boardwalk', params: { kind: 'boardwalk', surface: 'boardwalk', w: 16, d: 4, h: 0.2, lift: 1, color: SURFACE_COLORS.boardwalk } },
}

/** A new object for the plan: Connect and Auto route build these. */
export interface NewPiece {
  readonly kind: PathKind
  readonly name?: string
  readonly position: { readonly x: number; readonly n: number }
  readonly rotation: number
  /** Length and width, feet. */
  readonly w?: number
  readonly d?: number
  readonly ends?: { readonly zA?: number; readonly zB?: number }
  readonly surface?: string
  readonly rail?: boolean
}

/** A change to an existing object. */
export interface ObjectPatch {
  readonly id: ObjectId
  readonly params?: Record<string, unknown>
  readonly position?: { readonly x: number; readonly n: number }
  readonly rotation?: number
}

export interface PathActions {
  /** Add a piece at a site point, snapped to whatever it lands on; it becomes the selection. Returns its id, or null when refused. */
  readonly addPathPiece: (kind: PathKind, at: { x: number; n: number }, rotation?: number) => ObjectId | null
  /** Change a piece's settings; a new length keeps the snapped (or A) end where it is. */
  readonly setPieceParams: (id: ObjectId, patch: Record<string, unknown>) => void
  /** A new piece of the same kind and width running on from end A or B. */
  readonly continuePiece: (id: ObjectId, end: 'A' | 'B') => ObjectId | null
  /** Add pieces and change objects as one undo step; refused whole if any object is locked. Returns the new ids. */
  readonly applyPathEdit: (adds: readonly NewPiece[], patches?: readonly ObjectPatch[]) => ObjectId[]
}

export interface PathContext {
  readonly get: () => PlanState
  readonly set: (partial: Partial<PlanState>) => void
  readonly writable: () => boolean
  readonly editable: (id: ObjectId) => PlanObject | null
  readonly isLocked: (id: ObjectId) => boolean
  readonly terrain: Terrain
  readonly ground: Ground
}

const objectsOf = (plan: Plan): PlanObject[] => plan.order.map((id) => plan.objects[id]).filter(Boolean)

function freshId(plan: Plan): ObjectId {
  let k = plan.order.length + 1
  while (plan.objects[`piece-${k}`]) k++
  return `piece-${k}`
}

function freshName(plan: Plan, base: string): string {
  const stem = base.replace(/\s+\d+$/, '')
  const used = new Set(objectsOf(plan).map((o) => o.name))
  if (!used.has(stem)) return stem
  for (let k = 2; k < 999; k++) if (!used.has(`${stem} ${k}`)) return `${stem} ${k}`
  return stem
}

const withoutEnds = (params: Record<string, unknown>, ends: ReturnType<typeof refreshedEnds>): Record<string, unknown> => {
  const { ends: _old, ...rest } = params
  return ends ? { ...rest, ends } : rest
}

/**
 * A moved piece snapped to the nearest target within reach (one end only,
 * or either), with each end's level then taken from what it touches.
 */
export function snappedPiece(o: PlanObject, plan: Plan, terrain: Terrain, ground: Ground, only: 'A' | 'B' | null = null): { o: PlanObject; snap: SnapResult | null } {
  if (!isSnappable(o)) return { o, snap: null }
  const objects = objectsOf(plan)
  const E = pieceEnds(o, ground)
  const targets = snapTargets(objects, terrain, ground, o.id, [E.A, E.B])
  const snap = snapSolve(o, ground, targets, only)
  const moved = snap ? { ...o, position: { ...snap.position }, rotation: snap.rotation } : o
  const E2 = pieceEnds(moved, ground)
  const near = snapTargets(objects, terrain, ground, o.id, [E2.A, E2.B])
  return { o: { ...moved, params: withoutEnds(moved.params, refreshedEnds(moved, ground, near)) }, snap }
}

/** A piece whose ends' levels follow what they touch, without moving it (arrow nudges, turns). */
export function settledPiece(o: PlanObject, plan: Plan, terrain: Terrain, ground: Ground): PlanObject {
  if (!isPathPiece(o) || !o.params.kind) return o
  const E = pieceEnds(o, ground)
  const near = snapTargets(objectsOf(plan), terrain, ground, o.id, [E.A, E.B])
  return { ...o, params: withoutEnds(o.params, refreshedEnds(o, ground, near)) }
}

export function pathActions({ get, set, writable, editable, isLocked, terrain, ground }: PathContext): PathActions {
  const put = (plan: Plan, o: PlanObject): Plan => ({ ...plan, objects: { ...plan.objects, [o.id]: o }, order: plan.order.includes(o.id) ? plan.order : [...plan.order, o.id] })
  const toast = (snap: SnapResult | null) => snap && get().showToast(`Snapped: ${snap.end} → ${snap.target.label}`)
  const newObject = (plan: Plan, spec: NewPiece): PlanObject => {
    const lib = PIECE_LIBRARY[spec.kind]
    const params: Record<string, unknown> = {
      ...lib.params,
      ...(spec.w ? { w: spec.w } : {}),
      ...(spec.d ? { d: spec.d } : {}),
      surface: spec.surface ?? DEFAULT_SURFACE[spec.kind],
      ...(spec.rail !== undefined ? { rail: spec.rail } : {}),
      ...(spec.ends ? { ends: { ...spec.ends } } : {}),
    }
    return { id: freshId(plan), type: 'pad', name: freshName(plan, spec.name ?? lib.name), position: { ...spec.position }, rotation: spec.rotation, params, locked: false, hidden: false, labelVisible: true }
  }
  return {
    addPathPiece: (kind, at, rotation = 0) => {
      if (!writable()) return null
      const s = get()
      if (s.layers.paths.locked) {
        s.showToast('Decks and paths are locked')
        return null
      }
      const fresh = newObject(s.plan, { kind, position: at, rotation })
      const { o, snap } = snappedPiece(fresh, s.plan, terrain, ground)
      set({ plan: put(s.plan, o), selection: [o.id], pickedPart: null })
      toast(snap)
      return o.id
    },
    setPieceParams: (id, patch) => {
      const o0 = editable(id)
      if (!o0) return
      const s = get()
      let o: PlanObject = { ...o0, params: { ...o0.params, ...patch } }
      const newLen = num(patch.w, NaN)
      if (Number.isFinite(newLen) && isSnappable(o0)) {
        // hold the pinned end (A unless only B is pinned) where it was, then snap that end again
        const ends = (o0.params.ends ?? {}) as { zA?: number; zB?: number }
        const tag: 'A' | 'B' = ends.zA === undefined && ends.zB !== undefined ? 'B' : 'A'
        const E = pieceEnds(o0, ground)
        const anchor = tag === 'A' ? E.A : E.B
        const a = (o0.rotation * Math.PI) / 180
        const sg = tag === 'A' ? 1 : -1
        o = { ...o, position: { x: anchor[0] + (sg * Math.cos(a) * newLen * FT) / 2, n: anchor[1] + (sg * Math.sin(a) * newLen * FT) / 2 } }
        o = snappedPiece(o, s.plan, terrain, ground, tag).o
      } else o = settledPiece(o, s.plan, terrain, ground)
      set({ plan: put(s.plan, o) })
    },
    continuePiece: (id, end) => {
      const src = get().plan.objects[id]
      if (!src || !isPathPiece(src) || src.params.shape === 'ribbon' || !writable()) return null
      const kind = (typeof src.params.kind === 'string' ? src.params.kind : 'walk') as PathKind
      const E = pieceEnds(src, ground)
      const e = end === 'A' ? E.A : E.B
      const z = end === 'A' ? E.zA : E.zB
      const ax = (src.rotation * Math.PI) / 180
      const dir = end === 'A' ? [-Math.cos(ax), -Math.sin(ax)] : [Math.cos(ax), Math.sin(ax)]
      const L = DEFAULT_LENGTH[kind] ?? 12
      const rotation = +((Math.atan2(dir[1], dir[0]) * 180) / Math.PI).toFixed(1)
      const ids = get().applyPathEdit([
        {
          kind,
          name: src.name,
          position: { x: e[0] + (dir[0] * L * FT) / 2, n: e[1] + (dir[1] * L * FT) / 2 },
          rotation: ((rotation % 360) + 360) % 360,
          w: L,
          d: num(src.params.d, DEFAULT_WIDTH[kind]),
          surface: typeof src.params.surface === 'string' ? src.params.surface : undefined,
          ends: kind === 'walk' ? undefined : { zA: +z.toFixed(4) },
        },
      ])
      return ids[0] ?? null
    },
    applyPathEdit: (adds, patches = []) => {
      if (!writable()) return []
      const s = get()
      const locked = patches.find((p) => isLocked(p.id))
      if (locked) {
        s.showToast(`${s.plan.objects[locked.id]?.name ?? 'An object'} is locked`)
        return []
      }
      if (adds.length && s.layers.paths.locked) {
        s.showToast('Decks and paths are locked')
        return []
      }
      let plan = s.plan
      for (const p of patches) {
        const o = plan.objects[p.id]
        if (!o) continue
        plan = put(plan, { ...o, ...(p.position ? { position: { ...p.position } } : {}), ...(p.rotation !== undefined ? { rotation: p.rotation } : {}), params: p.params ? { ...o.params, ...p.params } : o.params })
      }
      const ids: ObjectId[] = []
      for (const spec of adds) {
        const o = newObject(plan, spec)
        plan = put(plan, o)
        ids.push(o.id)
      }
      if (plan === s.plan) return []
      set({ plan, selection: ids.length ? [ids[ids.length - 1]] : s.selection, pickedPart: null })
      return ids
    },
  }
}
