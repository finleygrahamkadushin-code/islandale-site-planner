import { localToSite, num } from '../../buildings/footprint'
import type { SitePoint, Terrain } from '../../site/types'
import { ftToM, mToFt } from '../../site/units'
import type { Plan, PlanObject } from '../../store/types'
import { centreline, isPathPiece, pieceEnds, SURFACE_COLORS, type Ground, type PathKind, type Surface } from '../pieces'
import { routeAnchors } from '../route/routeCollect'
import { JOIN_M, type RouteItem } from '../route/routeGraph'
import { refreshedEnds, SNAP_TOL_M } from '../snap'
import { snapTargets } from '../targets'

/**
 * Rebuilding the schemes' walks as path pieces. A scheme's walks are
 * kindless pads (straight lanes and paths) or curved ribbons; the route check
 * reads them loosely and can't tell where one stops. This turns each into
 * real 5C pieces, one per straight run, joined end to end: a walk where the
 * run is 1:20 or gentler, a ramp up to 1:12, and stairs where it's steeper.
 * Each keeps the walk's width, colour and surface. Pure: objects and ground
 * in, the objects to add and the ids to remove out.
 */

/** Steepest walk and ramp, rise over run (ADA 403.3 and 405.2). */
export const WALK_MAX_SLOPE = 1 / 20
export const RAMP_MAX_SLOPE = 1 / 12
/** A ribbon bend closer than this to the last kept point is folded into the run, metres. */
const MIN_RUN_M = ftToM(2)
/** A run shorter than this (both ends pulled to one point) is dropped, metres. */
const MIN_PIECE_M = 0.05

/** Is this a walk to rebuild: a kindless path pad, not a water rill. */
export function isWalkToRebuild(o: PlanObject): boolean {
  return !o.hidden && isPathPiece(o) && !o.params.kind && !/rill|runnel/i.test(o.name)
}

/** The walk's surface, read from its name. */
export function surfaceOf(name: string): Surface {
  if (/boardwalk|cedar|deck|timber/i.test(name)) return 'boardwalk'
  if (/flag|stone|paver|granite/i.test(name)) return 'pavers'
  if (/concrete/i.test(name)) return 'concrete'
  if (/grass|lawn|meadow/i.test(name)) return 'grass'
  return 'gravel'
}

/** The kind a straight run of this rise and length needs. */
export function kindFor(riseM: number, runM: number): PathKind {
  const slope = runM > 0 ? Math.abs(riseM) / runM : 0
  if (slope <= WALK_MAX_SLOPE + 1e-9) return 'walk'
  if (slope <= RAMP_MAX_SLOPE + 1e-9) return 'ramp'
  return 'stair'
}

/** The walk's centreline in site metres, with bends closer than 2 ft folded in. */
export function walkLine(o: PlanObject): SitePoint[] {
  const pts = centreline(o).map((p) => localToSite(o.position, o.rotation, p))
  const kept: SitePoint[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const last = kept[kept.length - 1]
    const far = Math.hypot(pts[i][0] - last[0], pts[i][1] - last[1]) >= MIN_RUN_M
    if (far || i === pts.length - 1) kept.push(pts[i])
  }
  // a short last run joins the one before it
  if (kept.length > 2) {
    const [p, q] = [kept[kept.length - 2], kept[kept.length - 1]]
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) < MIN_RUN_M) kept.splice(kept.length - 2, 1)
  }
  return kept
}

const round = (v: number, d: number) => +v.toFixed(d)

/** One path piece for the straight run a→b. */
function runPiece(o: PlanObject, a: SitePoint, b: SitePoint, ground: Ground, id: string, name: string): PlanObject {
  const runM = Math.hypot(b[0] - a[0], b[1] - a[1])
  const zA = ground(a[0], a[1])
  const zB = ground(b[0], b[1])
  const kind = kindFor(zB - zA, runM)
  const surface = surfaceOf(o.name)
  const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
  const params: Record<string, unknown> = {
    kind,
    surface,
    w: round(mToFt(runM), 2),
    d: num(o.params.d, 4),
    h: num(o.params.h, 0.2),
    color: typeof o.params.color === 'string' ? o.params.color : SURFACE_COLORS[surface],
    // ramps and stairs keep the ground's levels at each end; a walk drapes on the ground
    ...(kind === 'walk' ? {} : { ends: { zA: round(zA, 4), zB: round(zB, 4) } }),
    rebuiltFrom: o.id,
  }
  return {
    id,
    type: 'pad',
    name,
    position: { x: round((a[0] + b[0]) / 2, 4), n: round((a[1] + b[1]) / 2, 4) },
    rotation: round(((deg % 360) + 360) % 360, 2),
    params,
    locked: false,
    hidden: false,
    labelVisible: o.labelVisible,
  }
}

/** The pieces a walk's centreline becomes, in order from its first end to its last. */
export function linePieces(o: PlanObject, line: readonly SitePoint[], ground: Ground): PlanObject[] {
  const runs = line.length - 1
  return line
    .slice(1)
    .map((b, k) => ({ a: line[k], b, k }))
    .filter(({ a, b }) => Math.hypot(b[0] - a[0], b[1] - a[1]) > MIN_PIECE_M)
    .map(({ a, b, k }) => runPiece(o, a, b, ground, `${o.id}-p${k + 1}`, runs > 1 ? `${o.name} · ${k + 1}` : o.name))
}

/** The pieces one walk becomes on its own, without joining it to anything. */
export function walkPieces(o: PlanObject, ground: Ground): PlanObject[] {
  return linePieces(o, walkLine(o), ground)
}

/** How far one walk's end may be pulled to meet another's: the old scheme walks overlap by 0.3 × width at each end. */
const pieceReachM = (o: PlanObject) => 0.6 * ftToM(num(o.params.d, 4)) + JOIN_M
/** How far an end may be pulled onto a door, stair foot, deck edge or driveway. */
const anchorReachM = (o: PlanObject) => SNAP_TOL_M + 0.3 * ftToM(num(o.params.d, 4))

type Line = { readonly o: PlanObject; readonly pts: SitePoint[] }

/** Stand-in route items for the walks' ends, so the route check's own anchors (deck-edge and driveway points) are found for them. */
function endItems(lines: readonly Line[]): RouteItem[] {
  return lines.map(({ o, pts }) => {
    const a = pts[0]
    const b = pts[pts.length - 1]
    const reach = anchorReachM(o)
    return { id: o.id, name: o.name, kind: 'walk', widthFt: num(o.params.d, 4), lengthM: 0, ends: [{ x: a[0], n: a[1], z: 0, reach }, { x: b[0], n: b[1], z: 0, reach }], profile: [], rail: false }
  })
}

/**
 * Join the walks' outer ends. Ends of two walks within reach meet halfway
 * (the old scheme walks overlap at their ends); then each meeting point, or
 * free end, is pulled onto the nearest door, stair foot or top, deck edge or
 * driveway in reach, its partners moving with it.
 */
export function joinLines(lines: readonly Line[], others: readonly PlanObject[], terrain: Terrain, ground: Ground): Line[] {
  const out = lines.map((l) => ({ o: l.o, pts: [...l.pts] }))
  const ends = out.flatMap((_, i) => [{ i, e: 0 as const }, { i, e: 1 as const }])
  const at = (k: number): SitePoint => {
    const { i, e } = ends[k]
    return e ? out[i].pts[out[i].pts.length - 1] : out[i].pts[0]
  }
  const put = (k: number, p: SitePoint) => {
    const { i, e } = ends[k]
    out[i].pts[e ? out[i].pts.length - 1 : 0] = p
  }
  const reachOf = (k: number) => pieceReachM(out[ends[k].i].o)
  // group ends that meet: nearest pairs first, each end in one pair at most
  const group = ends.map((_, k) => k)
  const pairs: { a: number; b: number; d: number }[] = []
  for (let a = 0; a < ends.length; a++)
    for (let b = a + 1; b < ends.length; b++) {
      if (ends[a].i === ends[b].i) continue
      const p = at(a)
      const q = at(b)
      const d = Math.hypot(p[0] - q[0], p[1] - q[1])
      if (d <= Math.max(reachOf(a), reachOf(b))) pairs.push({ a, b, d })
    }
  const paired = new Set<number>()
  for (const { a, b } of pairs.sort((x, y) => x.d - y.d)) {
    if (paired.has(a) || paired.has(b)) continue
    paired.add(a)
    paired.add(b)
    group[b] = a
  }
  const members = new Map<number, number[]>()
  ends.forEach((_, k) => members.set(group[k], [...(members.get(group[k]) ?? []), k]))
  const groups = [...members.values()].map((ks) => {
    const ps = ks.map(at)
    const mid: SitePoint = [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length]
    return { ks, p: mid, reach: Math.max(...ks.map((k) => anchorReachM(out[ends[k].i].o))) }
  })
  const anchors = routeAnchors(others, terrain, ground, endItems(out))
  for (const g of groups) {
    let best: { d: number; x: number; n: number } | null = null
    for (const a of anchors) {
      const d = Math.hypot(a.x - g.p[0], a.n - g.p[1])
      if (d <= g.reach && (!best || d < best.d)) best = { d, x: a.x, n: a.n }
    }
    const to: SitePoint = best ? [best.x, best.n] : g.p
    for (const k of g.ks) put(k, to)
  }
  return out
}

export interface WalkRebuild {
  /** The plan with every rebuildable walk replaced by its pieces, each in the walk's place in the order. */
  readonly plan: Plan
  readonly walks: number
  readonly pieces: number
  /** Names of walks left as they were because they are locked. */
  readonly skipped: readonly string[]
}

/** Replace every unlocked walk in the plan with path pieces, their ends joined to each other and to what they meet. */
export function rebuildWalks(plan: Plan, terrain: Terrain, ground: Ground, isLocked: (id: string) => boolean = () => false): WalkRebuild {
  const all = plan.order.map((id) => plan.objects[id]).filter((o): o is PlanObject => !!o)
  const chosen = all.filter((o) => isWalkToRebuild(o) && !isLocked(o.id))
  const skipped = all.filter((o) => isWalkToRebuild(o) && isLocked(o.id)).map((o) => o.name)
  if (!chosen.length) return { plan, walks: 0, pieces: 0, skipped }
  const chosenIds = new Set(chosen.map((o) => o.id))
  const lines = joinLines(
    chosen.map((o) => ({ o, pts: walkLine(o) })),
    all.filter((o) => !chosenIds.has(o.id)),
    terrain,
    ground,
  )
  const taken = new Set(Object.keys(plan.objects).filter((id) => !chosenIds.has(id)))
  const fresh = (id: string) => {
    let k = 2
    let out = id
    while (taken.has(out)) out = `${id}-${k++}`
    taken.add(out)
    return out
  }
  const made = new Map(lines.map((l) => [l.o.id, linePieces(l.o, l.pts, ground).map((p) => ({ ...p, id: fresh(p.id) }))] as const))
  const objects: Record<string, PlanObject> = Object.fromEntries(Object.entries(plan.objects).filter(([id]) => !chosenIds.has(id)))
  const order = plan.order.flatMap((id) => (made.has(id) ? made.get(id)!.map((p) => p.id) : [id]))
  for (const ps of made.values()) for (const p of ps) objects[p.id] = p
  const pieces = [...made.values()].reduce((n, ps) => n + ps.length, 0)
  const next = { ...plan, objects, order }
  return { plan: settled(next, [...made.values()].flat(), terrain, ground), walks: chosen.length, pieces, skipped }
}

/**
 * Each piece's ends take the level of what they meet (a deck, a stair top), as
 * a placed piece's do, and its kind is then chosen from those levels: a walk
 * that meets a raised deck becomes a ramp or stairs rather than leaving a step.
 */
function settled(plan: Plan, made: readonly PlanObject[], terrain: Terrain, ground: Ground): Plan {
  const all = plan.order.map((id) => plan.objects[id])
  const objects = { ...plan.objects }
  for (const o of made) {
    // read the levels as a pinned piece would see them, then decide what it is
    const asPinned: PlanObject = { ...o, params: { ...o.params, kind: o.params.kind === 'walk' ? 'ramp' : o.params.kind } }
    const E = pieceEnds(asPinned, ground)
    const near = snapTargets(all, terrain, ground, o.id, [E.A, E.B])
    const touched = refreshedEnds(asPinned, ground, near) ?? {}
    const zA = touched.zA ?? E.gA
    const zB = touched.zB ?? E.gB
    const kind = kindFor(zB - zA, Math.hypot(E.B[0] - E.A[0], E.B[1] - E.A[1]))
    const flat = touched.zA === undefined && touched.zB === undefined
    if (kind === 'walk' && flat) {
      objects[o.id] = { ...o, params: withoutEnds({ ...o.params, kind: 'walk' }) }
      continue
    }
    objects[o.id] = { ...o, params: { ...o.params, kind, ends: { zA: round(zA, 4), zB: round(zB, 4) } } }
  }
  return { ...plan, objects }
}

const withoutEnds = (params: Record<string, unknown>): Record<string, unknown> => {
  const { ends: _ends, ...rest } = params
  return rest
}
