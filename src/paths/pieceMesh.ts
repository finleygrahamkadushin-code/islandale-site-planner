import { localToSite } from '../buildings/footprint'
import { emptyMesh, type MeshData } from '../buildings/geom'
import { beam, box, slab } from '../buildings/stairMesh'
import { planStair, type StairMat } from '../buildings/stairPlan'
import type { PlanObject } from '../store/types'
import { GUARD_IN, pieceEnds, pieceKind, pieceLength, pieceWidth, railOn, stairInfo, type Ground } from './pieces'

/**
 * A path piece's 3D pieces (old walkMesh), in its run frame, metres: z
 * along the piece from end A (−L/2) to end B (+L/2), x across, y up from
 * the ground at the piece's centre. Stairs and ramps come from the same
 * stair planner as stair and ramp wings (the old planner's stair-geom);
 * landings are a slab on a skirt, boardwalks a deck on posts; landings and
 * boardwalks get guards, stairs and ramps handrails, when railOn says so.
 * Walks are drawn as draped pads, not here.
 */
export interface PieceItem {
  readonly mat: StairMat
  readonly mesh: MeshData
}

export interface PieceMesh {
  readonly items: readonly PieceItem[]
  /** Turn of the run frame inside the piece's own frame: z onto the piece's +x (or −x when B is the top of a stair or ramp). */
  readonly rotY: number
  /** Ground at the piece's centre, metres: the frame's y 0. */
  readonly base: number
}

const FT = 0.3048
const IN = 0.0254
const SLAB_M = 0.15
const DECK_M = 0.12
const POST_M = 0.15
const RAIL_POST_M = 0.07

/** Guards: posts every `spacingFt` along both sides, a top rail at 36 in and a mid rail. */
function guards(L: number, hw: number, surf: (z: number) => number, spacingFt: number): MeshData {
  const mesh = emptyMesh()
  const h = GUARD_IN * IN
  const n = Math.max(1, Math.ceil(L / (spacingFt * FT) - 1e-9))
  for (const x of [-(hw - 0.04), hw - 0.04]) {
    for (let i = 0; i <= n; i++) {
      const z = -L / 2 + (L * i) / n
      box(mesh, x - RAIL_POST_M / 2, x + RAIL_POST_M / 2, surf(z), surf(z) + h + 0.03, z - RAIL_POST_M / 2, z + RAIL_POST_M / 2)
    }
    beam(mesh, x, -L / 2, surf(-L / 2) + h, L / 2, surf(L / 2) + h, 0.06, 0.05)
    beam(mesh, x, -L / 2, surf(-L / 2) + h / 2, L / 2, surf(L / 2) + h / 2, 0.04, 0.04)
  }
  return mesh
}

export function pieceMesh(o: Pick<PlanObject, 'position' | 'rotation' | 'params'>, ground: Ground): PieceMesh | null {
  const kind = pieceKind(o)
  if (kind === 'walk') return null
  const E = pieceEnds(o, ground)
  const L = pieceLength(o) * FT
  const W = pieceWidth(o) * FT
  const hw = W / 2
  const base = ground(o.position.x, o.position.n)
  // ground under the run frame's (x, z), as y
  const groundY = (x: number, z: number) => {
    const p = localToSite(o.position, o.rotation, [z / FT, -x / FT])
    return ground(p[0], p[1]) - base
  }
  const withRail = railOn(o, ground)
  if (kind === 'stair' || kind === 'ramp') {
    const aTop = E.zA >= E.zB
    const top = Math.max(E.zA, E.zB) - base
    const drop = Math.abs(E.zA - E.zB)
    const sg = aTop ? 1 : -1
    const plan = planStair({
      kind,
      w: W,
      run: L,
      drop: Math.max(drop, 0.01),
      n: kind === 'stair' ? stairInfo(o, ground).risers || undefined : undefined,
      rail: withRail,
      // the stair frame's z runs top → foot: the run frame's z when A is the top, else reversed
      groundAt: (z) => groundY(0, sg * z) - top,
      footPlate: kind === 'stair',
    })
    return { items: plan.items.map((it) => ({ mat: it.mat, mesh: shift(it.mesh, top) })), rotY: aTop ? Math.PI / 2 : -Math.PI / 2, base }
  }
  const surf = (z: number) => E.zA - base + ((E.zB - E.zA) * (z + L / 2)) / L
  const poly: [number, number][] = [[-hw, -L / 2], [hw, -L / 2], [hw, L / 2], [-hw, L / 2]]
  const items: PieceItem[] = []
  if (kind === 'landing') {
    const top = surf(0)
    items.push({ mat: 'stair', mesh: slab(emptyMesh(), poly, () => top, SLAB_M) })
    const low = Math.min(...[[-hw, -L / 2], [hw, -L / 2], [hw, L / 2], [-hw, L / 2], [0, 0]].map(([x, z]) => groundY(x, z))) - 0.1
    if (top - SLAB_M - low > 0.02) items.push({ mat: 'trim', mesh: box(emptyMesh(), -hw + 0.01, hw - 0.01, low, top - SLAB_M, -L / 2 + 0.01, L / 2 - 0.01) })
    if (withRail) items.push({ mat: 'rail', mesh: guards(L, hw, () => top, 4) })
  } else {
    // boardwalk: a deck on posts every 6 ft or so down both sides
    items.push({ mat: 'stair', mesh: slab(emptyMesh(), poly, (_x, z) => surf(z), DECK_M) })
    const posts = emptyMesh()
    const np = Math.max(1, Math.ceil(pieceLength(o) / 6 - 1e-9))
    for (const x of [-(hw - 0.1), hw - 0.1])
      for (let i = 0; i <= np; i++) {
        const z = -L / 2 + 0.1 + ((L - 0.2) * i) / np
        const y0 = groundY(x, z) - 0.2
        const y1 = surf(z) - DECK_M
        if (y1 - y0 > 0.02) box(posts, x - POST_M / 2, x + POST_M / 2, y0, y1, z - POST_M / 2, z + POST_M / 2)
      }
    items.push({ mat: 'post', mesh: posts })
    if (withRail) items.push({ mat: 'rail', mesh: guards(L, hw, surf, 6) })
  }
  return { items, rotY: Math.PI / 2, base }
}

/** Raise a mesh by dy (the stair planner puts the top surface at y 0). */
function shift(m: MeshData, dy: number): MeshData {
  return { ...m, positions: m.positions.map((v, i) => (i % 3 === 1 ? v + dy : v)) }
}
