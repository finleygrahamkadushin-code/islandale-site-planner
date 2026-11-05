import type { LocalPoint } from '../footprint'
import { buildingToMass, massPoly, type Mass } from '../masses'

/**
 * What Paint mode is over (legacy ext-tag extTag / hitElement): the part a
 * mesh is tagged with, mapped to its exterior key, and for a wall the edge
 * nearest the hit point. Pure.
 */

/** Parts the Exterior panel paints (legacy PARTS). */
export const PAINT_PARTS = ['wall', 'roof', 'trim', 'deck', 'post', 'door', 'glass', 'foundation', 'rail', 'slab'] as const
export type PaintPart = (typeof PAINT_PARTS)[number]

/** A tagged mesh's part → the exterior key it is painted under; stairs and ramps paint as decks (legacy extPartKey). */
export function paintPartOf(tag: unknown): PaintPart | null {
  if (tag === 'stair' || tag === 'ramp') return 'deck'
  return typeof tag === 'string' && (PAINT_PARTS as readonly string[]).includes(tag) ? (tag as PaintPart) : null
}

/** The edge of a mass nearest a building-local point (feet). */
export function nearestEdge(m: Mass, p: LocalPoint): number {
  const [x, z] = buildingToMass(m, p)
  const P = massPoly(m)
  let best = 0
  let bestD = Infinity
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const l2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2))
    const d = Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz))
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

const PART_LABELS: Readonly<Record<PaintPart, string>> = {
  wall: 'Wall',
  roof: 'Roof',
  trim: 'Trim',
  deck: 'Deck',
  post: 'Posts',
  door: 'Door',
  glass: 'Glass',
  foundation: 'Foundation',
  rail: 'Rail',
  slab: 'Floor slab',
}

/** "Main · Wall 3", "Deck 2 · Rail" (legacy elementLabel). */
export function elementLabel(massName: string, part: PaintPart, edge: number | null): string {
  return `${massName} · ${PART_LABELS[part]}${part === 'wall' && edge !== null ? ` ${edge + 1}` : ''}`
}
