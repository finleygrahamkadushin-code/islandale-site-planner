import { num, siteFootprint } from '../../buildings/footprint'
import { routePoints } from '../../buildings/decks/boardwalk'
import type { Mass } from '../../buildings/masses'
import { massSite, railOwner, surfaceZ } from '../../buildings/rails/railWorld'
import type { Terrain } from '../../site/types'
import type { PlanObject } from '../../store/types'
import { isDriveway, isPathPiece, pieceEnds, pieceKind, pieceLength, pieceProfile, pieceWidth, railOn, type Ground } from '../pieces'
import { JOIN_M, type P2, type RouteAnchor, type RouteItem } from './routeGraph'

/**
 * The route graph's items and anchors from the plan (old walkCollectItems):
 * every visible path piece, and the doors, stair and ramp wings, free deck
 * and porch edges and driveway edges they can lead to. Pure: the ground
 * and terrain come in.
 */

const FT = 0.3048
/** Doors are reached just outside the wall, metres (as walk-auto). */
const DOOR_OUT_M = 0.15
/** Widest kindless pad that counts as a path, feet. */
const NARROW_FT = 6
const isAccess = (m: Mass) => m.kind === 'stair' || m.kind === 'ramp'
const unit = (a: P2, b: P2): P2 => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]
}

/**
 * A boardwalk bridge as a route item: its route points, with the deck level
 * between them, judged by the same rules as a boardwalk piece (so a gentle
 * one carries the route and a steep one fails). Bridges are railed.
 */
export function bridgeItem(o: PlanObject): RouteItem | null {
  const pts = routePoints(o)
  if (pts.length < 2) return null
  let s = 0
  const profile = pts.map((p, i) => {
    if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1])
    return { s, z: p[2], cross: 0 }
  })
  const a = pts[0]
  const b = pts[pts.length - 1]
  return {
    id: o.id,
    name: o.name || 'Bridge',
    kind: 'boardwalk',
    widthFt: num(o.params.w, 5),
    lengthM: s,
    ends: [
      { x: a[0], n: a[1], z: a[2], reach: 0 },
      { x: b[0], n: b[1], z: b[2], reach: 0 },
    ],
    profile,
    rail: true,
  }
}

/** Every visible path piece and bridge as a route item. */
export function routeItems(objects: readonly PlanObject[], ground: Ground): RouteItem[] {
  return objects.flatMap((o): RouteItem[] => {
    if (o.hidden) return []
    if (o.type === 'bridge') {
      const b = bridgeItem(o)
      return b ? [b] : []
    }
    if (!isPathPiece(o)) return []
    const kindless = !o.params.kind
    // the old route check took kindless pads only up to 6 ft wide (lanes are 7)
    if (kindless && o.params.shape !== 'ribbon' && pieceWidth(o) > NARROW_FT) return []
    const E = pieceEnds(o, ground)
    const profile = pieceProfile(o, ground)
    // old scheme walks overlap consecutive pads by 0.3 × d ft at each end
    const reach = kindless && o.params.shape !== 'ribbon' ? 0.3 * pieceWidth(o) * FT : 0
    return [
      {
        id: o.id,
        name: o.name || (kindless ? 'Path' : pieceKind(o)),
        kind: pieceKind(o),
        widthFt: pieceWidth(o),
        lengthM: (profile.length > 1 ? profile[profile.length - 1].s : 0) || pieceLength(o) * FT,
        ends: [
          { x: E.A[0], n: E.A[1], z: E.zA, reach },
          { x: E.B[0], n: E.B[1], z: E.zB, reach },
        ],
        profile: profile.map((p) => ({ s: p.s, z: p.z, cross: p.cross })),
        rail: railOn(o, ground),
      },
    ]
  })
}

function buildingAnchors(o: PlanObject, terrain: Terrain, ground: Ground): RouteAnchor[] {
  const owner = railOwner(o, terrain, ground)
  if (!owner) return []
  const bname = o.name || o.type
  const building = owner.standalone ? null : o.id
  const wings = owner.masses.flatMap((m, mi): RouteAnchor[] => {
    if (!isAccess(m) || owner.standalone) return []
    const F = massSite(o, m, [0, m.d / 2])
    const T = massSite(o, m, [0, -m.d / 2])
    const u = unit(T, F)
    const label = `${bname} · ${m.kind} ${mi}`
    const access = m.kind as 'stair' | 'ramp'
    return [
      { id: `${o.id}:foot:${mi}`, name: `${label} foot`, type: 'wingfoot', x: F[0], n: F[1], z: ground(F[0], F[1]), reach: 0, building, access, dir: u },
      { id: `${o.id}:top:${mi}`, name: `${label} top`, type: 'wingtop', x: T[0], n: T[1], z: surfaceZ(owner, m), reach: 0, building, access, dir: [-u[0], -u[1]] },
    ]
  })
  const doors = owner.doors.map((d, k): RouteAnchor => ({
    id: `${o.id}:door:${d.mi}:${k}`,
    name: `${bname} · ${d.name.toLowerCase()}${owner.doors.length > 1 ? ` ${k + 1}` : ''}`,
    type: 'door',
    x: d.c[0] + d.nrm[0] * DOOR_OUT_M,
    n: d.c[1] + d.nrm[1] * DOOR_OUT_M,
    z: d.z,
    reach: 0,
    building,
    dir: d.nrm,
  }))
  return [...wings, ...doors]
}

/** Free deck and porch edges: one anchor at each midpoint, and one where a piece end meets the edge elsewhere. */
function deckAnchors(o: PlanObject, terrain: Terrain, ground: Ground, items: readonly RouteItem[]): RouteAnchor[] {
  const owner = railOwner(o, terrain, ground)
  if (!owner) return []
  const building = owner.standalone ? null : o.id
  const bname = o.name || (owner.standalone ? 'Deck' : o.type)
  return owner.deckEdges.flatMap((e, i): RouteAnchor[] => {
    const mid: P2 = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]
    const base = { type: 'deck' as const, z: e.z, reach: 0, building, dir: null, name: `${bname} · deck edge ${i + 1}` }
    const dx = e.b[0] - e.a[0]
    const dn = e.b[1] - e.a[1]
    const L2 = dx * dx + dn * dn
    const at = items.flatMap((it) =>
      it.ends.flatMap((pe, k): RouteAnchor[] => {
        if (!(L2 > 1e-12)) return []
        const t = Math.max(0, Math.min(1, ((pe.x - e.a[0]) * dx + (pe.n - e.a[1]) * dn) / L2))
        const x = e.a[0] + dx * t
        const n = e.a[1] + dn * t
        if (Math.hypot(pe.x - x, pe.n - n) > JOIN_M + pe.reach) return []
        if (Math.hypot(x - mid[0], n - mid[1]) < 1e-3) return []
        return [{ ...base, id: `${o.id}:deck:${i}:${it.id}:${k ? 'B' : 'A'}`, x, n }]
      }),
    )
    return [{ ...base, id: `${o.id}:deck:${i}`, x: mid[0], n: mid[1] }, ...at]
  })
}

const inPoly = (P: readonly P2[], x: number, n: number): boolean => {
  let c = false
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i]
    const b = P[j]
    if (a[1] > n !== b[1] > n && x < ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}

/** The point of a closed outline nearest (x, n), with the edge's unit normal (right of a→b). */
export function nearestOnOutline(P: readonly P2[], x: number, n: number): { x: number; n: number; d: number; nrm: P2 } {
  let best = { x: P[0][0], n: P[0][1], d: Infinity, nrm: [0, 0] as P2 }
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length]
    const dx = b[0] - a[0]
    const dn = b[1] - a[1]
    const L2 = dx * dx + dn * dn
    const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (n - a[1]) * dn) / L2)) : 0
    const px = a[0] + dx * t
    const pn = a[1] + dn * t
    const d = Math.hypot(px - x, pn - n)
    const L = Math.sqrt(L2) || 1
    if (d < best.d) best = { x: px, n: pn, d, nrm: [dn / L, -dx / L] }
  })
  return best
}

/** Driveway edge midpoints, and a point for each piece end inside the pad or within reach of its outline. */
function drivewayAnchors(o: PlanObject, ground: Ground, items: readonly RouteItem[]): RouteAnchor[] {
  const P = siteFootprint(o)
  if (P.length < 3) return []
  const name = o.name || 'Driveway'
  const cx = P.reduce((s, p) => s + p[0], 0) / P.length
  const cn = P.reduce((s, p) => s + p[1], 0) / P.length
  const edges = P.map((p, i): RouteAnchor => {
    const q = P[(i + 1) % P.length]
    const x = (p[0] + q[0]) / 2
    const n = (p[1] + q[1]) / 2
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
    const s = (x - cx) * ((q[1] - p[1]) / L) + (n - cn) * (-(q[0] - p[0]) / L) < 0 ? -1 : 1
    const dir: P2 = [(s * (q[1] - p[1])) / L, (-s * (q[0] - p[0])) / L]
    return { id: `${o.id}:edge:${i}`, name: `${name} · edge ${i + 1}`, type: 'driveway', x, n, z: ground(x, n), reach: 0, building: null, dir }
  })
  const near = items.flatMap((it) =>
    it.ends.flatMap((e, k): RouteAnchor[] => {
      const inside = inPoly(P, e.x, e.n)
      const best = nearestOnOutline(P, e.x, e.n)
      if (!inside && best.d > JOIN_M + e.reach) return []
      const x = inside ? e.x : best.x
      const n = inside ? e.n : best.n
      return [{ id: `${o.id}:near:${it.id}:${k ? 'B' : 'A'}`, name: `${name} · at ${it.name}`, type: 'driveway', x, n, z: ground(x, n), reach: 0, building: null, dir: null }]
    }),
  )
  return [...edges, ...near]
}

/** Every anchor on the site for these items. */
export function routeAnchors(objects: readonly PlanObject[], terrain: Terrain, ground: Ground, items: readonly RouteItem[]): RouteAnchor[] {
  const visible = objects.filter((o) => !o.hidden)
  return [
    ...visible.flatMap((o) => (o.type === 'house' ? buildingAnchors(o, terrain, ground) : isDriveway(o) && o.params.shape !== 'ribbon' ? drivewayAnchors(o, ground, items) : [])),
    ...visible.flatMap((o) => (o.type === 'house' || o.type === 'deck' ? deckAnchors(o, terrain, ground, items) : [])),
  ]
}

/** The buildings a route verdict is given for. */
export const routeBuildings = (objects: readonly PlanObject[]): { id: string; name: string }[] =>
  objects.filter((o) => !o.hidden && o.type === 'house').map((o) => ({ id: o.id, name: o.name || o.type }))

/** A driveway's point nearest `toward`, just inside its outline, facing out (old resolveFrom). */
export function drivewayStart(o: PlanObject, toward: { x: number; n: number }, ground: Ground): { x: number; n: number; z: number; dir: P2 } {
  const P = siteFootprint(o)
  const q = nearestOnOutline(P, toward.x, toward.n)
  const s = (q.x - o.position.x) * q.nrm[0] + (q.n - o.position.n) * q.nrm[1] >= 0 ? 1 : -1
  const x = q.x + s * q.nrm[0] * 0.05
  const n = q.n + s * q.nrm[1] * 0.05
  return { x, n, z: ground(x, n), dir: [s * q.nrm[0], s * q.nrm[1]] }
}

/** Closed building walls, ponds and pools: what an auto route goes round. */
export function routeObstacles(objects: readonly PlanObject[], terrain: Terrain, ground: Ground): P2[][] {
  return objects.flatMap((o): P2[][] => {
    if (o.hidden) return []
    if (o.type === 'pond' || o.type === 'pool') return [siteFootprint(o).map((p): P2 => [p[0], p[1]])]
    if (o.type !== 'house') return []
    return [...(railOwner(o, terrain, ground)?.walls ?? [])].map((w) => [...w])
  })
}
