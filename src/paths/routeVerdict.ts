import type { Terrain } from '../site/types'
import type { ObjectId, PlanObject } from '../store/types'
import type { Ground } from './pieces'
import { CITE, checkPieces, pct, type PieceVerdict } from './routeCheck'
import { routeAnchors, routeBuildings, routeItems } from './routeCollect'
import { endKey, LEVEL_M, routeGraph, type RouteAnchor, type RouteGraph } from './routeGraph'

/**
 * The accessible-route verdict per building (old walk-check routes): a
 * shortest search from any driveway anchor to the building's doors, wing
 * tops, free deck edges or ramp feet. First over passing, non-stair pieces
 * and level joins only; failing that, over any non-stair piece (naming the
 * failing ones); failing that, with stairs (naming them).
 */

export interface RouteVerdict {
  readonly building: ObjectId
  readonly name: string
  readonly ok: boolean
  readonly lengthM: number
  readonly maxSlope: number
  /** The old planner's one-line verdict. */
  readonly text: string
  /** Pieces on the best route that fail (or are stairs). */
  readonly failing: readonly ObjectId[]
}

export interface RouteReport {
  readonly graph: RouteGraph
  readonly pieces: ReadonlyMap<ObjectId, PieceVerdict>
  readonly routes: readonly RouteVerdict[]
  readonly summary: {
    readonly n: number
    readonly failing: number
    readonly failingIds: readonly ObjectId[]
    readonly routesOk: number
    readonly routes: number
    readonly ok: boolean
  }
}

const FT = 0.3048
const EPS = 1e-6

const isTarget = (a: RouteAnchor, building: ObjectId): boolean => {
  if (a.type === 'driveway' || a.building !== building) return false
  if (a.type === 'door' || a.type === 'wingtop' || a.type === 'deck') return true
  return a.type === 'wingfoot' && a.access === 'ramp'
}

/** Dijkstra from the driveway anchors: joins cost nothing, a piece its length. */
function search(G: RouteGraph, sources: readonly number[], targets: ReadonlySet<number>, allow: (id: ObjectId) => boolean, levelOnly: boolean): { dist: number; pieces: ObjectId[] } | null {
  const N = G.nodes.length
  const dist = new Array<number>(N).fill(Infinity)
  const prev = new Array<{ from: number; piece?: ObjectId } | null>(N).fill(null)
  const done = new Array<boolean>(N).fill(false)
  const lengths = new Map(G.items.map((p) => [p.id, p.lengthM] as const))
  for (const s of sources) dist[s] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < (u < 0 ? Infinity : dist[u])) u = i
    if (u < 0) return null
    done[u] = true
    if (targets.has(u)) {
      const pieces: ObjectId[] = []
      for (let c = u; prev[c]; c = prev[c]!.from) if (prev[c]!.piece !== undefined) pieces.unshift(prev[c]!.piece!)
      return { dist: dist[u], pieces }
    }
    for (const J of G.adj[u]) {
      if (levelOnly && Math.abs(J.dz) > LEVEL_M + EPS) continue
      if (dist[u] < dist[J.j]) {
        dist[J.j] = dist[u]
        prev[J.j] = { from: u }
      }
    }
    const nd = G.nodes[u]
    if (nd.piece === null || !allow(nd.piece)) continue
    const v = G.endNode.get(endKey(nd.piece, nd.end === 0 ? 1 : 0))
    if (v === undefined) continue
    const dd = dist[u] + (lengths.get(nd.piece) ?? 0)
    if (dd < dist[v] - 1e-12) {
      dist[v] = dd
      prev[v] = { from: u, piece: nd.piece }
    }
  }
}

/** The verdict for each building. */
export function buildingRoutes(G: RouteGraph, pieces: ReadonlyMap<ObjectId, PieceVerdict>, buildings: readonly { id: ObjectId; name: string }[]): RouteVerdict[] {
  const kindOf = new Map(G.items.map((p) => [p.id, p.kind] as const))
  const nameOf = (id: ObjectId) => G.items.find((p) => p.id === id)?.name || `piece ${id}`
  const sources = G.nodes.flatMap((nd, k) => (nd.anchor?.type === 'driveway' ? [k] : []))
  const maxSlope = (ids: readonly ObjectId[]) => ids.reduce((m, id) => Math.max(m, pieces.get(id)?.slope ?? 0), 0)
  return buildings.map((b): RouteVerdict => {
    const r = { building: b.id, name: b.name, ok: false, lengthM: 0, maxSlope: 0, failing: [] as ObjectId[] }
    if (!sources.length) return { ...r, text: `${b.name}: no driveway on the site` }
    const targets = new Set(G.nodes.flatMap((nd, k) => (nd.anchor && isTarget(nd.anchor, b.id) ? [k] : [])))
    if (!targets.size) return { ...r, text: `${b.name}: no door or ramp to reach` }
    const good = search(G, sources, targets, (id) => kindOf.get(id) !== 'stair' && !!pieces.get(id)?.ok, true)
    if (good) {
      const ms = maxSlope(good.pieces)
      return { ...r, ok: true, lengthM: good.dist, maxSlope: ms, text: `${b.name}: reachable, ${Math.round(good.dist / FT)} ft, max ${pct(ms)}` }
    }
    const any = search(G, sources, targets, (id) => kindOf.get(id) !== 'stair', false)
    if (any) {
      const failing = any.pieces.filter((id) => pieces.get(id) && !pieces.get(id)!.ok)
      const text = failing.length
        ? `${b.name}: ${failing.length} piece${failing.length > 1 ? 's' : ''} fail (${failing.map(nameOf).join(', ')})`
        : `${b.name}: step at the door or driveway join (max ½ in, ${CITE.level})`
      return { ...r, lengthM: any.dist, maxSlope: maxSlope(any.pieces), failing, text }
    }
    const withStairs = search(G, sources, targets, () => true, false)
    if (withStairs) {
      const st = withStairs.pieces.filter((id) => kindOf.get(id) === 'stair')
      const failing = withStairs.pieces.filter((id) => kindOf.get(id) === 'stair' || (pieces.get(id) && !pieces.get(id)!.ok))
      return {
        ...r,
        lengthM: withStairs.dist,
        failing,
        text: `${b.name}: only by stairs (${st.map(nameOf).join(', ')}) — stairs are not an accessible route (${CITE.stair}); use a ramp`,
      }
    }
    return { ...r, text: `${b.name}: no continuous route` }
  })
}

/** The whole check for a plan: every piece's verdict and every building's route. */
export function routeReport(objects: readonly PlanObject[], terrain: Terrain, ground: Ground): RouteReport {
  const items = routeItems(objects, ground)
  const graph = routeGraph(items, routeAnchors(objects, terrain, ground, items))
  const pieces = checkPieces(graph)
  const routes = buildingRoutes(graph, pieces, routeBuildings(objects))
  const failingIds = [...pieces].filter(([, v]) => !v.ok).map(([id]) => id)
  return {
    graph,
    pieces,
    routes,
    summary: {
      n: pieces.size,
      failing: failingIds.length,
      failingIds,
      routesOk: routes.filter((r) => r.ok).length,
      routes: routes.length,
      ok: !failingIds.length && routes.every((r) => r.ok),
    },
  }
}

/** The code-check rows (old "Accessible route · ADA 402–405" and "Path pieces"). */
export function reportRows(rep: RouteReport): { route: { ok: boolean; lines: string[] }; pieces: { ok: boolean; text: string } } {
  const { n, failing } = rep.summary
  const route = !n
    ? { ok: true, lines: ['no path pieces yet — build a route from the driveway with Walk / Ramp / Landing pieces'] }
    : !rep.routes.length
      ? { ok: true, lines: ['no buildings yet'] }
      : { ok: rep.routes.every((r) => r.ok), lines: rep.routes.map((r) => r.text) }
  return { route, pieces: { ok: !failing, text: n ? `${n} piece${n > 1 ? 's' : ''}, ${failing ? `${failing} failing` : 'all pass'}` : 'none' } }
}
