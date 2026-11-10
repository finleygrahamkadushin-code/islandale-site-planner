import type { LocalPoint } from '../footprint'
import { massPoly, type Mass } from '../masses'

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
    const d = segDist(p, a, b)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function segDist(p: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const L2 = dx * dx + dz * dz
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t)
}
