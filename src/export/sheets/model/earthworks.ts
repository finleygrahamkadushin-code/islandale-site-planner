import { signedArea, siteToLocal, localToSite, type LocalPoint } from '../../../buildings/footprint'
import { earthOps } from '../../../scene/placement'
import { isoSegments, type Field } from '../../../site/contours'
import { opReach, signedDistance, siteEarthworks, WALL_THICKNESS_M, type BuildingEarthOp, type EarthField, type EarthOp, type SiteEarthworks } from '../../../site/earthworks/earthworks'
import { elevationAt } from '../../../site/terrain'
import type { SitePoint, Terrain } from '../../../site/types'
import { mToFt } from '../../../site/units'
import type { PlanObject } from '../../../store/types'
import { spanLabel } from './curves'
import type { SheetBerm, SheetCourt, SheetEarthworks, SheetPart, SheetRetainingWall } from '../types'

/**
 * The earthworks on the sheets: retaining walls, berms, sunken courts and
 * where the fill and cuts meet the survey, read from the same
 * siteEarthworks the 3D scene builds its ground from (useEarthworks), and
 * turned into the building frame, feet.
 */

/** The plan's earthworks, worked out once for every sheet. */
export interface PlanEarth {
  readonly ops: readonly EarthOp[]
  readonly works: SiteEarthworks
}

/** The same earthworks objects and reshaped ground useEarthworks gives the scene. */
export function planEarth(visible: readonly PlanObject[], terrain: Terrain): PlanEarth {
  const ops = earthOps(visible, terrain)
  return { ops, works: siteEarthworks(terrain, ops) }
}

/** Fill or cut thinner than this is the survey, metres (about 1 in). */
const LIMIT_M = 0.025
/** Limit lines nearer the walls than this many raster samples are left out. */
const CLEAR_SAMPLES = 2
/** The toe is looked for this often out from the wall, feet. */
const TOE_STEP_FT = 0.25
/** A run of berm edges named one by one up to this many; longer runs, or runs round a curve, by their P points. */
const NAMED_EDGES = 3
/** A mitred offset corner reaches no further than this many times the offset. */
const MITRE_LIMIT = 3

type Seg = readonly [LocalPoint, LocalPoint]

const lengthOf = (pts: readonly LocalPoint[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0)

/** Outward unit normal of edge a → b of an outline with the given signed area (earthEdges' rule). */
function outward(a: LocalPoint, b: LocalPoint, area: number): LocalPoint {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l = Math.hypot(dx, dz) || 1
  return area > 0 ? [dz / l, -dx / l] : [-dz / l, dx / l]
}

/** An open polyline moved out by d, its inner corners mitred (and capped). */
export function offsetPolyline(pts: readonly LocalPoint[], d: number, area: number): LocalPoint[] {
  const ns = pts.slice(1).map((b, i) => outward(pts[i], b, area))
  return pts.map((p, i) => {
    const n0 = ns[Math.max(0, i - 1)]
    const n1 = ns[Math.min(ns.length - 1, i)]
    const sx = n0[0] + n1[0]
    const sz = n0[1] + n1[1]
    const l = Math.hypot(sx, sz) || 1
    const cos = (sx / l) * n1[0] + (sz / l) * n1[1]
    const k = Math.min(MITRE_LIMIT, 1 / Math.max(1e-6, cos)) * d
    return [p[0] + (sx / l) * k, p[1] + (sz / l) * k]
  })
}

/** Edge indices grouped into runs that follow on round the closed outline, each in order. */
export function edgeRuns(edges: readonly number[], n: number): number[][] {
  const set = new Set(edges)
  if (set.size >= n) return [Array.from({ length: n }, (_, i) => i)]
  const starts = [...set].filter((i) => !set.has((i - 1 + n) % n)).sort((a, b) => a - b)
  return starts.map((s) => {
    const run = [s]
    while (set.has((run[run.length - 1] + 1) % n)) run.push((run[run.length - 1] + 1) % n)
    return run
  })
}

interface Frame {
  readonly o: PlanObject
  readonly terrain: Terrain
  readonly works: SiteEarthworks
  readonly floorM: number
  readonly main: SheetPart
}

const local = (f: Frame, p: SitePoint) => siteToLocal(f.o.position, f.o.rotation, p)
const site = (f: Frame, p: LocalPoint) => localToSite(f.o.position, f.o.rotation, p)
const rel = (f: Frame, m: number) => mToFt(m - f.floorM)

function wallsOf(f: Frame): SheetRetainingWall[] {
  return f.works.walls
    .filter((w) => w.id === f.o.id)
    .map((w, k) => {
      const face = w.pts.map((p) => local(f, p))
      const tops = w.tops.map((t) => rel(f, t))
      return {
        tag: `RW${k + 1}`,
        material: w.material,
        face,
        back: w.outer.map((p) => local(f, p)),
        lengthFt: lengthOf(face),
        thicknessFt: mToFt(WALL_THICKNESS_M),
        topStartFt: tops[0],
        topEndFt: tops[tops.length - 1],
        topLowFt: Math.min(...tops),
        topHighFt: Math.max(...tops),
        bottomFt: rel(f, w.floor),
        footFt: rel(f, w.foot),
      }
    })
}

/** The walls a run of edges names: "back, right" for a few straight ones, "P3–P9" otherwise. */
function sideName(main: SheetPart, run: readonly number[]): string {
  const edges = run.map((i) => main.edges[i])
  if (edges.length <= NAMED_EDGES && edges.every((e) => e && !e.curved)) return edges.map((e) => e.name).join(', ')
  return spanLabel(main.outline.length, run[0], run[run.length - 1])
}

/** How far out from the wall, along its outward normal at this point, the berm comes down onto the survey; null if not within reach. */
function toeOut(f: Frame, at: LocalPoint, n: LocalPoint, fromFt: number, reachFt: number): number | null {
  for (let d = fromFt; d <= reachFt; d += TOE_STEP_FT) {
    const [x, y] = site(f, [at[0] + n[0] * d, at[1] + n[1] * d])
    if (f.works.ground(x, y) - elevationAt(f.terrain, x, y) < LIMIT_M) return d
  }
  return null
}

function bermsOf(f: Frame, op: BuildingEarthOp): SheetBerm[] {
  const outline = f.main.outline
  const area = signedArea(outline)
  const reachFt = mToFt(opReach(f.terrain, op))
  return f.works.berms
    .filter((b) => b.id === f.o.id)
    .flatMap((b) =>
      edgeRuns(b.sides, outline.length).map((run): SheetBerm => {
        const line = [...run.map((i) => outline[i]), outline[(run[run.length - 1] + 1) % outline.length]]
        const crestWidthFt = mToFt(b.crest)
        const toes = run.flatMap((i) => {
          const a = outline[i]
          const c = outline[(i + 1) % outline.length]
          const d = toeOut(f, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], outward(a, c, area), crestWidthFt, reachFt)
          return d === null ? [] : [d]
        })
        return {
          side: sideName(f.main, run),
          edges: run,
          line,
          crest: offsetPolyline(line, crestWidthFt, area),
          lengthFt: lengthOf(line),
          crestFt: rel(f, b.top),
          crestWidthFt,
          slope: b.slope,
          toeOutFt: toes.length ? { min: Math.min(...toes), max: Math.max(...toes) } : null,
        }
      }),
    )
}

function courtsOf(f: Frame): SheetCourt[] {
  return f.works.courts
    .filter((c) => c.id === f.o.id)
    .map((c) => {
      const outline = c.poly.map((p) => local(f, p))
      const dist = (i: number, j: number) => Math.hypot(outline[j][0] - outline[i][0], outline[j][1] - outline[i][1])
      return { side: f.main.edges[c.side]?.name ?? `edge ${c.side + 1}`, outline, widthFt: dist(0, 1), depthFt: dist(1, 2), floorFt: rel(f, c.floor) }
    })
}

const opPolys = (op: EarthOp) => (op.kind === 'pond' ? [op.poly] : op.polys)

interface Box {
  readonly x0: number
  readonly x1: number
  readonly n0: number
  readonly n1: number
}

/** The fill or cut depth over the part of a reshaped patch inside a box, as a field to contour; null when they miss. */
function depthField(e: EarthField, b: Box): Field | null {
  const i0 = Math.max(0, Math.floor((b.x0 - e.x0) / e.h))
  const i1 = Math.min(e.ni, Math.ceil((b.x1 - e.x0) / e.h))
  const j0 = Math.max(0, Math.floor((b.n0 - e.n0) / e.h))
  const j1 = Math.min(e.nj, Math.ceil((b.n1 - e.n0) / e.h))
  if (i1 <= i0 || j1 <= j0) return null
  const W = e.ni + 1
  return { nx: i1 - i0 + 1, ny: j1 - j0 + 1, x0: e.x0 + i0 * e.h, n0: e.n0 + j0 * e.h, spacing: e.h, at: (i, j) => e.z[(j + j0) * W + i + i0] - e.zb[(j + j0) * W + i + i0] }
}

/**
 * Where the earthworks meet the survey, outside the building, on the ground
 * this building shapes: each segment is kept where this building is the
 * nearest earthworks object, so a neighbour's fill or a pond is left to its
 * own sheet, and clear of the walls by two raster samples, where the
 * contour only traces the ground kept down inside the building.
 */
function limitsOf(f: Frame, op: BuildingEarthOp, ops: readonly EarthOp[]): { fill: Seg[]; cut: Seg[] } {
  const mine = (x: number, n: number, clear: number) => {
    const d = signedDistance(op.polys, x, n)
    return d > clear && ops.every((q) => q === op || signedDistance(opPolys(q), x, n) >= d)
  }
  const reach = opReach(f.terrain, op)
  const pts = op.polys.flat()
  const xs = pts.map((p) => p[0])
  const ns = pts.map((p) => p[1])
  const box = { x0: Math.min(...xs) - reach, x1: Math.max(...xs) + reach, n0: Math.min(...ns) - reach, n1: Math.max(...ns) + reach }
  const fields = f.works.fields.flatMap((e) => depthField(e, box) ?? [])
  const at = (level: number) =>
    fields.flatMap((g) =>
      isoSegments(g, level).flatMap(([x1, n1, x2, n2]): Seg[] => (mine((x1 + x2) / 2, (n1 + n2) / 2, CLEAR_SAMPLES * g.spacing) ? [[local(f, [x1, n1]), local(f, [x2, n2])]] : [])),
    )
  return { fill: at(LIMIT_M), cut: at(-LIMIT_M) }
}

/** A building's earthworks on the sheets, or null when it leaves the ground as surveyed. */
export function sheetEarthworks(o: PlanObject, earth: PlanEarth, terrain: Terrain, floorM: number, main: SheetPart | undefined): SheetEarthworks | null {
  const op = earth.ops.find((q): q is BuildingEarthOp => q.kind === 'building' && q.id === o.id)
  if (!op || !main) return null
  const f: Frame = { o, terrain, works: earth.works, floorM, main }
  const limits = limitsOf(f, op, earth.ops)
  return { sinkFt: op.spec.sink, walls: wallsOf(f), berms: bermsOf(f, op), courts: courtsOf(f), fillLimit: limits.fill, cutLimit: limits.cut }
}

/** Every point the earthworks draw in plan, for the drawing's extent. */
export function earthworksPoints(e: SheetEarthworks | null): LocalPoint[] {
  if (!e) return []
  return [
    ...e.walls.flatMap((w) => [...w.face, ...w.back]),
    ...e.berms.flatMap((b) => b.crest),
    ...e.courts.flatMap((c) => c.outline),
    ...e.fillLimit.flat(),
    ...e.cutLimit.flat(),
  ]
}
