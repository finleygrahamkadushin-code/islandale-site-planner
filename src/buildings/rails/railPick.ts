import type { LocalPoint } from '../footprint'
import { massPoly, type Mass } from '../masses'
import { pointSegmentDistance } from '../../site/geom2d'

/**
 * Which rail a click landed on (deliberate addition, PLAN.md): of the
 * edges a rail mesh lists, the one nearest the clicked point, both in the
 * mass's own frame (feet). A stair handrail lists one edge, so it is that.
 */
export function railEdgeAt(m: Mass, edges: readonly number[], p: LocalPoint): number | null {
  if (!edges.length) return null
  if (edges.length === 1) return edges[0]
  const P = massPoly(m)
  let best: number | null = null
  let bestD = Infinity
  for (const i of edges) {
    const a = P[i]
    const b = P[(i + 1) % P.length]
    if (!a || !b) continue
    const d = pointSegmentDistance(p, a, b)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
