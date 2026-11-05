import type { PlanObject } from '../store/types'
import type { Ground } from '../site/earthworks/earthworks'
import { pieceEnds, pieceLength } from './pieces'
import type { SnapTarget } from './targets'

/**
 * End-to-end snapping (old walkSnapSolve): the end nearest a target within
 * reach lands exactly on it, the piece turned to run on along the target's
 * direction; and each end's pinned level follows what it touches (old
 * refreshEnds).
 */

const FT = 0.3048
/** Snap reach, metres (3 ft). */
export const SNAP_TOL_M = 3 * FT
/** An end this close to a target takes its level, metres. */
const TOUCH_M = 0.05

export interface SnapResult {
  readonly position: { readonly x: number; readonly n: number }
  readonly rotation: number
  readonly end: 'A' | 'B'
  readonly target: SnapTarget
  readonly dist: number
}

const normDeg = (r: number) => {
  const v = ((r % 360) + 360) % 360
  return v >= 359.995 ? 0 : v
}

/** The best snap for a piece's ends (both, or one), or null when nothing is within reach. */
export function snapSolve(piece: Pick<PlanObject, 'position' | 'rotation' | 'params'>, ground: Ground, targets: readonly SnapTarget[], only: 'A' | 'B' | null = null, tol = SNAP_TOL_M): SnapResult | null {
  const E = pieceEnds(piece, ground)
  const L = pieceLength(piece) * FT
  let best: SnapResult | null = null
  for (const [tag, e] of [['A', E.A], ['B', E.B]] as const) {
    if (only && only !== tag) continue
    for (const t of targets) {
      const d = Math.hypot(t.x - e[0], t.n - e[1])
      if (!(d <= tol) || (best && d >= best.dist)) continue
      let rot = piece.rotation
      const dl = t.dir ? Math.hypot(t.dir[0], t.dir[1]) : 0
      if (t.dir && dl > 1e-9) {
        let ux = t.dir[0] / dl
        let un = t.dir[1] / dl
        if (tag === 'B') {
          ux = -ux
          un = -un
        }
        rot = normDeg(+(Math.round((Math.atan2(un, ux) * 1800) / Math.PI) / 10).toFixed(1))
      }
      const a = (rot * Math.PI) / 180
      const s = tag === 'A' ? 1 : -1
      best = { position: { x: t.x + (s * Math.cos(a) * L) / 2, n: t.n + (s * Math.sin(a) * L) / 2 }, rotation: rot, end: tag, target: t, dist: d }
    }
  }
  return best
}

/** The `ends` param after the piece moved: each end touching a target takes its level; the others are dropped. */
export function refreshedEnds(piece: Pick<PlanObject, 'position' | 'rotation' | 'params'>, ground: Ground, targets: readonly SnapTarget[]): { zA?: number; zB?: number } | undefined {
  if (!piece.params.kind || piece.params.kind === 'walk') return undefined
  const E = pieceEnds(piece, ground)
  const out: { zA?: number; zB?: number } = {}
  for (const [tag, e] of [['A', E.A], ['B', E.B]] as const) {
    let hit: SnapTarget | null = null
    let hd = TOUCH_M
    for (const t of targets) {
      const d = Math.hypot(t.x - e[0], t.n - e[1])
      if (d < hd && Number.isFinite(t.z)) {
        hd = d
        hit = t
      }
    }
    if (hit) out[tag === 'A' ? 'zA' : 'zB'] = +hit.z.toFixed(4)
  }
  return Object.keys(out).length ? out : undefined
}
