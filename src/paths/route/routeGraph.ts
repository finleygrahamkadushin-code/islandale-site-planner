import type { ObjectId } from '../../store/types'
import type { PathKind } from '../pieces'

/**
 * The route graph (old ext:walk-route and the node pass of ext:walk-check):
 * each path piece gives two end nodes, each anchor (driveway edge, door,
 * stair or ramp wing foot and top, free deck edge) one node. Nodes closer
 * than JOIN_M (plus their reach) join; a join is level when the ends meet
 * within ½ in, else a step. An unjoined end within GAP_M of another node
 * is a gap. Pure: items and anchors come in as data, in site metres.
 */

export type P2 = readonly [number, number]

/** Ends closer than this join, metres. */
export const JOIN_M = 0.3
/** A larger change of level at a join is a step (½ in), metres. */
export const LEVEL_M = 0.013
/** An unjoined end this close to another node is a gap, metres. */
export const GAP_M = 1.0

export interface RouteEnd {
  readonly x: number
  readonly n: number
  /** Walking surface, metres NAVD88. */
  readonly z: number
  /** Extra join distance (old kindless pads overlap their neighbours), metres. */
  readonly reach: number
}

/** A path piece as the checks see it. */
export interface RouteItem {
  readonly id: ObjectId
  readonly name: string
  readonly kind: PathKind
  readonly widthFt: number
  readonly lengthM: number
  readonly ends: readonly [RouteEnd, RouteEnd]
  /** The walking surface along the piece (distance from A, surface, cross slope). */
  readonly profile: readonly { readonly s: number; readonly z: number; readonly cross: number }[]
  readonly rail: boolean
}

export type AnchorType = 'driveway' | 'door' | 'wingfoot' | 'wingtop' | 'deck'

/** Something a route starts at or reaches. */
export interface RouteAnchor {
  readonly id: string
  readonly name: string
  readonly type: AnchorType
  readonly x: number
  readonly n: number
  readonly z: number
  readonly reach: number
  /** The building it belongs to (null for driveways and standalone decks). */
  readonly building: ObjectId | null
  /** Stair or ramp, for wing feet and tops. */
  readonly access?: 'stair' | 'ramp'
  /** Away from what it belongs to. */
  readonly dir: P2 | null
}

export interface RouteNode {
  readonly piece: ObjectId | null
  readonly end: 0 | 1
  readonly anchor: RouteAnchor | null
  readonly x: number
  readonly n: number
  readonly z: number
  readonly reach: number
}

/** A join to node `j`; `dz` is its surface less this node's. */
export interface Join {
  readonly j: number
  readonly dz: number
}

export interface RouteGraph {
  readonly items: readonly RouteItem[]
  readonly anchors: readonly RouteAnchor[]
  readonly nodes: readonly RouteNode[]
  readonly adj: readonly (readonly Join[])[]
  /** The nearest node within gap distance that is not joined, per node. */
  readonly near: readonly ({ readonly j: number; readonly d: number } | null)[]
  /** Node index of a piece's end. */
  readonly endNode: ReadonlyMap<string, number>
}

export const endKey = (piece: ObjectId, end: 0 | 1): string => `${piece}:${end}`

export function routeGraph(items: readonly RouteItem[], anchors: readonly RouteAnchor[], joinM = JOIN_M, gapM = GAP_M): RouteGraph {
  const nodes: RouteNode[] = [
    ...items.flatMap((p) => p.ends.map((e, k): RouteNode => ({ piece: p.id, end: k as 0 | 1, anchor: null, x: e.x, n: e.n, z: e.z, reach: Math.max(0, e.reach) }))),
    ...anchors.map((a): RouteNode => ({ piece: null, end: 0, anchor: a, x: a.x, n: a.n, z: a.z, reach: Math.max(0, a.reach) })),
  ]
  const adj: Join[][] = nodes.map(() => [])
  const near: ({ j: number; d: number } | null)[] = nodes.map(() => null)
  const closer = (i: number, j: number, d: number) => {
    if (!near[i] || d < near[i]!.d) near[i] = { j, d }
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const A = nodes[i]
      const B = nodes[j]
      if (A.piece !== null && A.piece === B.piece) continue
      // anchors only join through pieces
      if (A.anchor && B.anchor) continue
      const d = Math.hypot(A.x - B.x, A.n - B.n)
      const reach = A.reach + B.reach
      if (d <= joinM + reach + 1e-9) {
        adj[i].push({ j, dz: B.z - A.z })
        adj[j].push({ j: i, dz: A.z - B.z })
      } else if (d <= gapM + reach) {
        closer(i, j, d)
        closer(j, i, d)
      }
    }
  }
  const endNode = new Map<string, number>()
  nodes.forEach((nd, k) => {
    if (nd.piece !== null) endNode.set(endKey(nd.piece, nd.end), k)
  })
  return { items, anchors, nodes, adj, near, endNode }
}

/** What to call a node in a message: the anchor's or the piece's name. */
export function nodeName(g: RouteGraph, nd: RouteNode): string {
  if (nd.anchor) return nd.anchor.name || nd.anchor.type
  return g.items.find((p) => p.id === nd.piece)?.name || `piece ${nd.piece}`
}
