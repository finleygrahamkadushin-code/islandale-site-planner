import { siteFootprint } from '../buildings/footprint'
import type { ObjectId, PlanObject } from '../store/types'

/**
 * Arranging several objects (4B): align their footprint boxes' edges or
 * centres, spread their centres evenly, and box select. Pure: objects in,
 * new positions (site metres) out; the store applies them as one undo step.
 */

export type AlignMode = 'west' | 'east' | 'north' | 'south' | 'centre-x' | 'centre-n'
export type Axis = 'x' | 'n'
type Pos = { x: number; n: number }

interface Bounds {
  readonly minX: number
  readonly maxX: number
  readonly minN: number
  readonly maxN: number
}

function boundsOf(o: PlanObject): Bounds {
  const pts = siteFootprint(o)
  const xs = pts.map((p) => p[0])
  const ns = pts.map((p) => p[1])
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minN: Math.min(...ns), maxN: Math.max(...ns) }
}

/** Where each object goes so the chosen edge or centre lines up with the group's. */
export function alignedPositions(objects: readonly PlanObject[], mode: AlignMode): Record<ObjectId, Pos> {
  const bs = objects.map(boundsOf)
  const all: Bounds = {
    minX: Math.min(...bs.map((b) => b.minX)),
    maxX: Math.max(...bs.map((b) => b.maxX)),
    minN: Math.min(...bs.map((b) => b.minN)),
    maxN: Math.max(...bs.map((b) => b.maxN)),
  }
  const out: Record<ObjectId, Pos> = {}
  objects.forEach((o, i) => {
    const b = bs[i]
    const { x, n } = o.position
    const shift: Pos =
      mode === 'west' ? { x: all.minX - b.minX, n: 0 }
      : mode === 'east' ? { x: all.maxX - b.maxX, n: 0 }
      : mode === 'south' ? { x: 0, n: all.minN - b.minN }
      : mode === 'north' ? { x: 0, n: all.maxN - b.maxN }
      : mode === 'centre-x' ? { x: (all.minX + all.maxX) / 2 - (b.minX + b.maxX) / 2, n: 0 }
      : { x: 0, n: (all.minN + all.maxN) / 2 - (b.minN + b.maxN) / 2 }
    out[o.id] = { x: x + shift.x, n: n + shift.n }
  })
  return out
}

/** Centres spread evenly along one axis between the two end objects, which stay where they are. */
export function distributedPositions(objects: readonly PlanObject[], axis: Axis): Record<ObjectId, Pos> {
  const sorted = [...objects].sort((p, q) => p.position[axis] - q.position[axis])
  const first = sorted[0].position[axis]
  const last = sorted[sorted.length - 1].position[axis]
  const step = sorted.length > 1 ? (last - first) / (sorted.length - 1) : 0
  return Object.fromEntries(sorted.map((o, i) => [o.id, { ...o.position, [axis]: first + step * i }]))
}

/** The visible objects whose centre is inside the north-up box between two site points. */
export function idsInBox(objects: readonly PlanObject[], a: Pos, b: Pos): ObjectId[] {
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)]
  const [n0, n1] = [Math.min(a.n, b.n), Math.max(a.n, b.n)]
  return objects.filter((o) => !o.hidden && o.position.x >= x0 && o.position.x <= x1 && o.position.n >= n0 && o.position.n <= n1).map((o) => o.id)
}
