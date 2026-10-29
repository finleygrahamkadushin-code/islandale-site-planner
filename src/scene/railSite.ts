import type { LocalPoint } from '../buildings/footprint'
import { massPoly, type Mass } from '../buildings/masses'
import type { EdgeDraw } from '../buildings/railEdits'
import {
  clearanceHits,
  junctionOpenings,
  mergeIntervals,
  postsClearOfDoors,
  wallAbutOpenings,
  type ClearItem,
  type DoorSpot,
  type HostEdge,
  type Interval,
  type Landing,
} from '../buildings/railOpenings'
import { edgeFree, isRailable, resolveEdges, type EdgeOpenings, type EdgeRail } from '../buildings/railRules'
import { groundWithCuts, type Ground } from '../site/earthworks'
import { ftToM } from '../site/units'
import type { RailDrawQuery } from '../store/railResolver'
import type { PlanObject } from '../store/types'
import { sunkCuts } from './placement'
import { massSite, opensRails, railOwner, railWorld, stairTopOf, surfaceZ, type RailOwner, type RailWorld } from './railWorld'

/**
 * Each mass's rails for one building or standalone deck: what the rule
 * draws per edge, with the openings that stairs, path pieces, bridges,
 * doors, abutting decks and walls make in it (legacy join-rails and
 * rail-clear). The object is passed in, not read from the world, so a
 * building being dragged rails where it is drawn.
 */

/** A wing level within this of another counts as the same level (legacy rail-clear, feet). */
const SAME_LEVEL_FT = 0.5
const isAccess = (m: Mass) => m.kind === 'stair' || m.kind === 'ramp'

/** Edges of this object that things can land on: free deck and porch edges, and walls with doors. */
function hostEdges(me: RailOwner): HostEdge[] {
  const { o, masses } = me
  return masses.flatMap((m, mi) => {
    if (isAccess(m)) return []
    const P = massPoly(m)
    const z = surfaceZ(me, m)
    const edge = (i: number) => ({ mi, i, a: massSite(o, m, P[i]), b: massSite(o, m, P[(i + 1) % P.length]), z })
    if (isRailable(m)) return P.flatMap((_, i) => (me.standalone || edgeFree(masses, mi, i) ? [edge(i)] : []))
    const doors = me.doors.filter((d) => d.mi === mi)
    return P.flatMap((_, i) => {
      const spans = doors.filter((d) => d.edge === i).map((d): Interval => [d.u0, d.u1])
      return spans.length ? [{ ...edge(i), doors: spans }] : []
    })
  })
}

/** Everything that may land on this object's edges. */
function landings(me: RailOwner, world: RailWorld): Landing[] {
  const own: Landing[] = me.standalone
    ? []
    : me.masses.flatMap((m): Landing[] => {
        if (!isAccess(m)) return []
        const top = stairTopOf(me.o, m)
        return [{ kind: m.kind === 'ramp' ? 'ramp-wing' : 'stair-wing', at: top.c, z: surfaceZ(me, m), w: top.w, top }]
      })
  const ends: Landing[] = world.ends.filter((e) => e.owner !== me.o.id).map((e) => ({ kind: e.kind, at: e.at, z: e.z, w: e.w }))
  const abut: Landing[] = world.owners.flatMap((w) => (w.o.id === me.o.id ? [] : w.deckEdges.map((e) => ({ kind: 'deck-abut' as const, a: e.a, b: e.b, z: e.z }))))
  return [...own, ...ends, ...abut]
}

/** What one railable mass keeps clear of: this building's stairs and ramps at its level, path and bridge ends, every door. */
function clearItems(me: RailOwner, world: RailWorld, m: Mass): ClearItem[] {
  const wings: ClearItem[] = me.standalone
    ? []
    : me.masses.flatMap((w, wi): ClearItem[] => {
        if (!isAccess(w) || Math.abs(w.lvl - m.lvl) >= SAME_LEVEL_FT) return []
        return [{ type: 'wing', kind: w.kind === 'ramp' ? 'ramp' : 'stair', top: stairTopOf(me.o, w), z: surfaceZ(me, w), name: w.name ?? `${w.kind === 'ramp' ? 'Ramp' : 'Stair'} ${wi}` }]
      })
  const ends: ClearItem[] = world.ends.filter((e) => e.owner !== me.o.id).map((e) => ({ type: e.kind, at: e.at, z: e.z, w: e.w, name: e.name }))
  const doors = [...me.doors, ...world.owners.flatMap((w) => (w.o.id === me.o.id ? [] : w.doors))]
  return [...wings, ...ends, ...doors.map((d): ClearItem => ({ type: 'door', a: d.a, b: d.b, nrm: d.nrm, z: d.z, name: d.name }))]
}

/** The openings function for mass mi of this object. */
function openingsFor(me: RailOwner, world: RailWorld, mi: number): (i: number) => EdgeOpenings {
  const m = me.masses[mi]
  const P = massPoly(m)
  const hosts = hostEdges(me)
  const lands = landings(me, world)
  const items = clearItems(me, world, m)
  const walls = [...me.walls, ...world.owners.flatMap((w) => (w.o.id === me.o.id ? [] : w.walls))]
  const z = surfaceZ(me, m)
  return (i) => {
    const edge = { a: massSite(me.o, m, P[i]), b: massSite(me.o, m, P[(i + 1) % P.length]), z }
    const L = Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1])
    const hits = clearanceHits(edge, items)
    const all = [...junctionOpenings(hosts, lands, { mi, i }), ...hits.map((h): Interval => [h.u0, h.u1]), ...wallAbutOpenings(edge, walls)]
    const intervals = mergeIntervals(all.map(([a, b]): Interval => [Math.max(0, a), Math.min(L, b)]))
    return { intervals, names: [...new Set(hits.map((h) => h.name))] }
  }
}

/** Ground under a mass-local point (feet), metres. */
const groundIn = (o: PlanObject, m: Mass, ground: Ground) => (x: number, z: number) => {
  const [sx, sn] = massSite(o, m, [x, z] as LocalPoint)
  return ground(sx, sn)
}

/** The lowest ground under a standalone deck's corners, for its whole-deck drop (legacy deckDropFt). */
function deckDropM(me: RailOwner, ground: Ground): number {
  const m = me.masses[0]
  return me.base - Math.min(...massPoly(m).map(([x, z]) => groundIn(me.o, m, ground)(x, z)))
}

/** One object's rails: per mass, every edge (null for masses that never carry a guard), and where its porch posts must not stand. */
export interface ObjectRails {
  readonly rails: readonly (EdgeRail[] | null)[]
  /** For mass mi: whether a mass-local point (feet) is in front of a door of another mass (legacy porchPostKeep). */
  readonly inDoorway: (mi: number) => (p: LocalPoint) => boolean
}

const NO_RAILS: ObjectRails = { rails: [], inDoorway: () => () => false }

/** The rails of a building or standalone deck, drawn where `o` is (not where the world has it). */
export function objectRailSite(world: RailWorld, o: PlanObject): ObjectRails {
  const me = railOwner(o, world.terrain, world.ground)
  if (!me) return NO_RAILS
  const rails = me.masses.map((m, mi) => {
    if (!isRailable(m)) return null
    const groundAt = groundIn(o, m, world.ground)
    const floor = me.standalone ? me.base : me.base + ftToM(m.lvl)
    const standalone = me.standalone ? { dropM: deckDropM(me, world.ground) } : undefined
    return resolveEdges(me.masses, mi, { floor, groundAt, standalone, openings: openingsFor(me, world, mi) })
  })
  const doors = [...me.doors, ...world.owners.flatMap((w) => (w.o.id === o.id ? [] : w.doors))]
  const inDoorway = (mi: number) => {
    const m = me.masses[mi]
    const spots: DoorSpot[] = doors.filter((d) => !(d.owner === o.id && d.mi === mi))
    if (!m || !spots.length) return () => false
    const z = surfaceZ(me, m)
    return (p: LocalPoint) => !postsClearOfDoors([massSite(o, m, p)], spots, z)[0]
  }
  return { rails, inDoorway }
}

/** Per mass, every edge's rail (null for masses that never carry a guard), for a building or standalone deck. */
export function objectRails(world: RailWorld, o: PlanObject): readonly (EdgeRail[] | null)[] {
  return objectRailSite(world, o).rails
}

/** The rail world of a whole plan, with the displayed ground (sunk buildings' cuts included). */
export function planRailWorld(objects: readonly PlanObject[], terrain: RailWorld['terrain']): RailWorld {
  const visible = objects.filter((o) => !o.hidden)
  return railWorld(visible.filter(opensRails), terrain, groundWithCuts(terrain, sunkCuts(visible, terrain)))
}

/** The store's rail resolver: per edge, what is drawn now and what auto would draw, for setRail's first write. */
export function resolveRailDraws(q: RailDrawQuery): readonly EdgeDraw[] | null {
  const o = q.plan.objects[q.id]
  if (!o) return null
  const world = planRailWorld(
    q.plan.order.map((id) => q.plan.objects[id]).filter((x): x is PlanObject => !!x),
    q.site.terrain,
  )
  const edges = objectRails(world, o)[q.mass]
  return edges ? edges.map(({ legacy, auto, free }) => ({ legacy, auto, free })) : null
}
