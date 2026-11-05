import { wingSlots } from '../../buildings/masses'
import type { Ground } from '../../site/earthworks'
import type { ObjectId, PlanObject } from '../../store/types'
import type { LevelFix, LevelReport } from './levels'
import { pieceEnds } from '../pieces'

/**
 * Fix and Level everything (old level-floors applyFixes, fixesOf,
 * levelEverything) as data: the fixes become one patch per touched object
 * (merged, so a piece fixed at both ends gets one patch), which the caller
 * applies as a single undo step. Pure.
 */

export interface PlanPatch {
  readonly objectId: ObjectId
  /** Top-level params to replace (`ends` on a piece, `wings` on a building). */
  readonly params?: Readonly<Record<string, unknown>>
  /** New position, only when a snapEnd fix moves a piece. */
  readonly position?: { readonly x: number; readonly n: number }
}

export interface LevelEverything {
  readonly patches: readonly PlanPatch[]
  /** Fixes that changed something. */
  readonly count: number
  /** The toast. */
  readonly message: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const r4 = (v: number) => +v.toFixed(4)

interface Work {
  readonly o: PlanObject
  readonly keys: ReadonlySet<string>
  readonly moved: boolean
}

const withParams = (w: Work, key: string, value: unknown): Work => ({ o: { ...w.o, params: { ...w.o.params, [key]: value } }, keys: new Set([...w.keys, key]), moved: w.moved })
const endsWith = (o: PlanObject, end: 'A' | 'B', z: number) => ({ ...(isRecord(o.params.ends) ? o.params.ends : {}), [`z${end}`]: r4(z) })
const isWalk = (o: PlanObject) => !o.params.kind || o.params.kind === 'walk'

/** One fix applied to a working copy, or null when it does not apply. */
function applyOne(w: Work, f: LevelFix, ground: Ground): Work | null {
  if (f.type === 'setEnds') {
    if (!Number.isFinite(f.z)) return null
    return withParams(w, 'ends', endsWith(w.o, f.end, f.z))
  }
  if (f.type === 'snapEnd') {
    if (!Number.isFinite(f.x) || !Number.isFinite(f.n)) return null
    const E = pieceEnds(w.o, ground)
    const at = f.end === 'A' ? E.A : E.B
    const o = { ...w.o, position: { x: w.o.position.x + f.x - at[0], n: w.o.position.n + f.n - at[1] } }
    const moved: Work = { o, keys: w.keys, moved: true }
    return Number.isFinite(f.z) && !isWalk(o) ? withParams(moved, 'ends', endsWith(o, f.end, f.z)) : moved
  }
  const slot = wingSlots(w.o.params)[f.mi - 1]
  const wings = Array.isArray(w.o.params.wings) ? (w.o.params.wings as unknown[]) : []
  if (!f.mi || slot === undefined || !Number.isFinite(f.lvl)) return null
  return withParams(w, 'wings', wings.map((wing, k) => (k === slot && isRecord(wing) ? { ...wing, lvl: f.lvl } : wing)))
}

const targetOf = (f: LevelFix): ObjectId => (f.type === 'setLvl' ? f.host : f.piece)

/** The patches for a list of fixes, one per object, in the order first touched; and how many fixes applied. Locked objects are left alone. */
export function fixPatches(fixes: readonly LevelFix[], objects: readonly PlanObject[], ground: Ground): { patches: PlanPatch[]; count: number } {
  const byId = new Map(objects.map((o) => [o.id, o]))
  const work = new Map<ObjectId, Work>()
  let count = 0
  for (const f of fixes) {
    const id = targetOf(f)
    const cur = work.get(id) ?? (byId.has(id) ? { o: byId.get(id)!, keys: new Set<string>(), moved: false } : null)
    const next = cur && !cur.o.locked ? applyOne(cur, f, ground) : null
    if (!next) continue
    work.set(id, next)
    count++
  }
  const patches = [...work.entries()].map(([objectId, w]): PlanPatch => ({
    objectId,
    ...(w.keys.size ? { params: Object.fromEntries([...w.keys].map((k) => [k, w.o.params[k]])) } : {}),
    ...(w.moved ? { position: { x: w.o.position.x, n: w.o.position.n } } : {}),
  }))
  return { patches, count }
}

/** Every fix a building's report offers. */
export const fixesOf = (report: LevelReport): LevelFix[] => report.items.flatMap((it) => (it.fix ? [it.fix] : []))

/** Level everything on a building: all its fixes as one set of patches, and the toast. */
export function levelEverything(report: LevelReport, objects: readonly PlanObject[], ground: Ground): LevelEverything {
  const name = report.name || 'this building'
  const F = fixesOf(report)
  if (!F.length) return { patches: [], count: 0, message: `Everything on ${name} is already level` }
  const { patches, count } = fixPatches(F, objects, ground)
  return { patches, count, message: count ? `Levelled ${count} junction${count > 1 ? 's' : ''} on ${name} · Undo to revert` : '' }
}
