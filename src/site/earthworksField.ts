import { elevationAt, surfaceElevationAt } from './terrain'
import type { SitePoint, Terrain } from './types'
import { earthEdges, earthSides } from './earthworksSpec'
import { retainingWalls, type RetainingWall } from './earthworksWalls'
import { benchAndCut, berm, keepInsideDown, newRaster, pinBorder, pond, type Box, type Distances, type Prepared, type PreparedBuilding, type PreparedPond, type Raster } from './earthworksPasses'
import type { CellRect, EarthField, EarthOp, Ground, PondWater, SiteEarthworks } from './earthworksTypes'

/**
 * The legacy earthRebuild passes on a fine raster: fill benches, sunk
 * floors with their margins and courts, berms with a rounded crest, never
 * any fill inside a building, then ponds (flat water at the lowest rim
 * point, a soft bowl, a wet margin) and retaining walls along deep cuts.
 * Everything is worked out once per set of objects (bounding boxes and
 * signed distances per object, as the old code did); the ground is then a
 * lookup into the raster, cheap enough to call per terrain vertex.
 */

const FT = 0.3048

/** The cut floor sits this far under the building floor (legacy o.floor − 0.03), metres. */
const CUT_UNDER_FLOOR_M = 0.03
/** Influence reach caps and margins, metres (legacy R). */
const REACH_CAP_M = 40
const POND_REACH_M = 2

const flat = (P: readonly SitePoint[]): Float64Array => Float64Array.from(P.flat())

/** How far past its outlines (and courts) an object can change the ground, metres, terrain spacing included (legacy R). */
export function opReach(t: Terrain, op: EarthOp): number {
  if (op.kind === 'pond') return POND_REACH_M + t.spacing
  const e = op.spec
  const low = op.gradeLow - 1.5
  const top = op.floor + e.berm * FT
  const r = Math.max(
    e.berm ? e.crest * FT + 1.2 + Math.max(0, top - low) * e.slope : 0,
    e.fill ? Math.max(0, op.floor - low) * e.slope + 1.5 : 0,
    e.margin * FT + 1.5,
    e.walls ? 1.5 : (e.sink * FT + 0.5) * e.slope + e.margin * FT + 1,
  )
  return Math.min(REACH_CAP_M, r) + t.spacing
}

function prepare(t: Terrain, op: EarthOp): Prepared {
  const reach = opReach(t, op)
  if (op.kind === 'pond') return { kind: 'pond', op, poly: flat(op.poly), box: boxOf(op.poly, reach) }
  const e = op.spec
  const edges = earthEdges(t, op.main)
  const D = e.court * FT
  const courtSides = e.court > 0 ? earthSides(edges, e.courtSides) : []
  const courts = courtSides.map(({ a, b, nw: [ux, un] }): SitePoint[] => [a, b, [b[0] + ux * D, b[1] + un * D], [a[0] + ux * D, a[1] + un * D]])
  return {
    kind: 'building',
    op,
    polys: op.polys.map(flat),
    courts: courts.map(flat),
    courtPolys: courts,
    courtSides: courtSides.map((c) => c.i),
    berms: e.berm ? earthSides(edges, e.sides) : [],
    floorC: op.floor - CUT_UNDER_FLOOR_M,
    crestTop: op.floor + e.berm * FT,
    doCut: e.sink > 0 || e.margin > 0 || e.court > 0,
    box: boxOf([...op.polys.flat(), ...courts.flat()], reach),
  }
}

function boxOf(pts: readonly SitePoint[], r: number): Box {
  let x0 = Infinity
  let x1 = -Infinity
  let n0 = Infinity
  let n1 = -Infinity
  for (const [x, n] of pts) {
    x0 = Math.min(x0, x - r)
    x1 = Math.max(x1, x + r)
    n0 = Math.min(n0, n - r)
    n1 = Math.max(n1, n + r)
  }
  return { x0, x1, n0, n1 }
}

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The block of terrain cells covering a box. */
export function boxCells(t: Terrain, b: Box): CellRect {
  return {
    c0: clampInt(Math.floor((b.x0 - t.x0) / t.spacing), 0, t.nx - 1),
    c1: clampInt(Math.ceil((b.x1 - t.x0) / t.spacing), 0, t.nx - 1),
    r0: clampInt(Math.floor((b.n0 - t.n0) / t.spacing), 0, t.ny - 1),
    r1: clampInt(Math.ceil((b.n1 - t.n0) / t.spacing), 0, t.ny - 1),
  }
}

const overlaps = (a: CellRect, b: CellRect) => a.c0 < b.c1 && b.c0 < a.c1 && a.r0 < b.r1 && b.r0 < a.r1
const union = (a: CellRect, b: CellRect): CellRect => ({ c0: Math.min(a.c0, b.c0), c1: Math.max(a.c1, b.c1), r0: Math.min(a.r0, b.r0), r1: Math.max(a.r1, b.r1) })

/** Objects whose cell blocks overlap share one patch, so their passes meet as the old single patch had them meet. */
function clusters(rects: readonly CellRect[]): { rect: CellRect; members: number[] }[] {
  let groups = rects.map((rect, i) => ({ rect, members: [i] }))
  for (let merged = true; merged; ) {
    merged = false
    const next: typeof groups = []
    for (const g of groups) {
      const hit = next.find((q) => overlaps(q.rect, g.rect))
      if (hit) {
        hit.rect = union(hit.rect, g.rect)
        hit.members.push(...g.members)
        merged = true
      } else next.push({ rect: g.rect, members: [...g.members] })
    }
    groups = next
  }
  return groups.map((g) => ({ rect: g.rect, members: g.members.sort((a, b) => a - b) }))
}

/** A raster's height at a point, bilinear or on the mesh's triangles, or null outside it. */
export function fieldHeight(f: EarthField, x: number, n: number, drawn = false): number | null {
  const fx = (x - f.x0) / f.h
  const fy = (n - f.n0) / f.h
  if (!(fx >= 0 && fy >= 0 && fx <= f.ni && fy <= f.nj)) return null
  const W = f.ni + 1
  const i = Math.min(f.ni - 1, Math.floor(fx))
  const j = Math.min(f.nj - 1, Math.floor(fy))
  const tx = fx - i
  const ty = fy - j
  const k = j * W + i
  const z00 = f.z[k]
  const z10 = f.z[k + 1]
  const z01 = f.z[k + W]
  const z11 = f.z[k + W + 1]
  if (!drawn) return (z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty
  // the patch mesh splits each cell along the same diagonal as the terrain mesh
  if (tx + ty <= 1) return z00 + (z10 - z00) * tx + (z01 - z00) * ty
  return z11 + (z01 - z11) * (1 - tx) + (z10 - z11) * (1 - ty)
}

function sampler(fields: readonly EarthField[]) {
  return (x: number, n: number, drawn = false): number | null => {
    for (const f of fields) {
      const v = fieldHeight(f, x, n, drawn)
      if (v !== null) return v
    }
    return null
  }
}

function build(t: Terrain, ops: readonly EarthOp[]): SiteEarthworks {
  const prepared = ops.map((op) => prepare(t, op))
  const groups = clusters(prepared.map((p) => boxCells(t, p.box)))
  const rasters = groups.map((g) => newRaster(t, g.rect))
  const walls: RetainingWall[] = []
  const ponds = new Map<string, PondWater>()
  const buildings: { p: PreparedBuilding; d: Distances; R: Raster }[] = []
  groups.forEach((g, gi) => {
    const R = rasters[gi]
    const B = g.members.map((i) => prepared[i]).filter((p): p is PreparedBuilding => p.kind === 'building')
    const dist = B.map((p) => benchAndCut(R, p))
    B.forEach((p, i) => berm(R, p, dist[i]))
    B.forEach((p, i) => keepInsideDown(R, p, dist[i]))
    B.forEach((p, i) => buildings.push({ p, d: dist[i], R }))
  })
  // ponds read the ground the buildings left, then dig their own bowls
  const live = sampler(rasters)
  const liveGround: Ground = (x, n) => live(x, n) ?? elevationAt(t, x, n)
  groups.forEach((g, gi) => {
    g.members
      .map((i) => prepared[i])
      .filter((p): p is PreparedPond => p.kind === 'pond')
      .forEach((p) => ponds.set(p.op.id, pond(rasters[gi], p, liveGround)))
  })
  rasters.forEach(pinBorder)
  const fields: readonly EarthField[] = rasters
  const sample = sampler(fields)
  const ground: Ground = (x, n) => sample(x, n) ?? elevationAt(t, x, n)
  const drawnGround: Ground = (x, n) => sample(x, n, true) ?? surfaceElevationAt(t, x, n)
  for (const { p, d, R } of buildings) {
    if (!p.op.spec.walls || !p.doCut) continue
    const grid = { x0: R.x0, n0: R.n0, h: R.h, ...d.r, rw: d.rw, sd: d.sdC }
    walls.push(...retainingWalls(grid, p.floorC, p.op.spec.wallMat, p.op.id, ground))
  }
  const berms = buildings
    .filter(({ p }) => p.berms.length)
    .map(({ p }) => ({ id: p.op.id, top: p.crestTop, edges: p.berms.map((e) => [e.a, e.b] as const), sides: p.berms.map((e) => e.i), crest: p.op.spec.crest * FT, slope: p.op.spec.slope }))
  const courts = buildings.flatMap(({ p }) => p.courtPolys.map((poly, k) => ({ id: p.op.id, poly, side: p.courtSides[k], floor: p.floorC })))
  return { fields, ponds, walls, berms, courts, sample, ground, drawnGround }
}

// One build per set of objects: every hook and the rail resolver ask for the same ground.
const CACHE_MAX = 8
const cache = new WeakMap<Terrain, Map<string, SiteEarthworks>>()

/** The reshaped ground for a set of earthworks objects over the survey (cached by their data). */
export function siteEarthworks(t: Terrain, ops: readonly EarthOp[]): SiteEarthworks {
  const key = JSON.stringify(ops)
  let byKey = cache.get(t)
  if (!byKey) cache.set(t, (byKey = new Map()))
  const hit = byKey.get(key)
  if (hit) return hit
  const made = build(t, ops)
  if (byKey.size >= CACHE_MAX) byKey.delete(byKey.keys().next().value as string)
  byKey.set(key, made)
  return made
}
