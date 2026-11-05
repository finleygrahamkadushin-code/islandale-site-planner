import { pointInPolygon } from '../buildings/foundation/foundation'
import { isoSegments, type IsoSegment } from './contours'
import { isShorelineEdge } from './parcel'
import type { Parcel } from './types'

/** Legacy default shoreline buffer (the sb-shore slider), feet. */
export const SHORE_BUFFER_FT = 35
const GRID_M = 0.5

/**
 * The line inside the lot that stands `bufferM` back from the shoreline
 * (OHWM) edges: the iso-line of distance-to-shore over a fine grid, kept
 * to the lot.
 */
export function shoreBufferLine(parcel: Parcel, bufferM: number): IsoSegment[] {
  const ring = parcel.ring
  const shore = ring.map((a, i) => [a, ring[(i + 1) % ring.length]] as const).filter((_, i) => isShorelineEdge(parcel, i))
  if (!shore.length) return []
  const xs = ring.map((p) => p[0])
  const ns = ring.map((p) => p[1])
  const x0 = Math.min(...xs) - GRID_M
  const n0 = Math.min(...ns) - GRID_M
  const nx = Math.ceil((Math.max(...xs) - x0) / GRID_M) + 2
  const ny = Math.ceil((Math.max(...ns) - n0) / GRID_M) + 2
  const dist = (x: number, n: number) => Math.min(...shore.map(([a, b]) => segDist(x, n, a[0], a[1], b[0], b[1])))
  return isoSegments(
    { nx, ny, x0, n0, spacing: GRID_M, at: (i, j) => {
      const x = x0 + i * GRID_M
      const n = n0 + j * GRID_M
      return pointInPolygon(ring, x, n) ? dist(x, n) : NaN
    } },
    bufferM,
  )
}

function segDist(px: number, pn: number, ax: number, an: number, bx: number, bn: number): number {
  const dx = bx - ax
  const dn = bn - an
  const l2 = dx * dx + dn * dn || 1
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pn - an) * dn) / l2))
  return Math.hypot(px - (ax + t * dx), pn - (an + t * dn))
}
