import { ShapeUtils, Vector2 } from 'three'
import { num, signedArea, type LocalPoint } from '../../buildings/footprint'
import { addPolygon, emptyMesh, type MeshData, type V3 } from '../../buildings/geom'
import { polyOffset } from '../../buildings/organic'
import { ftToM } from '../units'

/**
 * A pool (legacy poolPlanPoly, poolInfEdges, poolMesh, poolLevel): its
 * footprint is the coping's outer edge, the water is that outline inset by
 * the coping, and the edges that face the front (the bay) spill over as
 * infinity edges. The pool is level: its coping sits just above the highest
 * ground round it, or at its fixed `elev`. Pure: feet in, metres out, in the
 * pool's own frame (x right, y up from the coping level, z front).
 */

const FT = 0.3048

/** Coping width when the pool has none of its own, feet. */
export const POOL_COPING_FT = 1.2
/** The water's depth below the coping, metres (legacy pool floor at -1.4 m). */
export const POOL_WATER_DEPTH_M = 1.4
/** The coping stands this far above the highest ground round the pool, metres. */
export const POOL_FREEBOARD_M = 0.05
/** An edge spills over when its outward normal points this much toward the front (legacy nz > 0.45). */
const INFINITY_FACING = 0.45
/** The shell's walls run at least this deep, and this far below the lowest ground round it, metres. */
const MIN_SHELL_M = 1.6
const SHELL_BELOW_GROUND_M = 0.4
/** Spill sheets hang this far outside their edge and at most this far down, metres. */
const SHEET_OFFSET_M = 0.03
const SHEET_MAX_M = 2.2

export interface PoolParams {
  readonly coping?: unknown
  readonly infinity?: unknown
  readonly elev?: unknown
}

export interface PoolLayout {
  /** The coping's outer edge (the pool's footprint), local feet. */
  readonly outer: readonly LocalPoint[]
  /** The water's edge, the footprint inset by the coping, local feet. */
  readonly water: readonly LocalPoint[]
  /** Indices of the footprint's edges that are infinity edges (edge i runs from point i to i + 1). */
  readonly infinity: readonly number[]
}

/** An edge's outward normal by the old rule: perpendicular to it, flipped to point away from the pool's centre. */
function edgeNormal(a: LocalPoint, b: LocalPoint): readonly [number, number] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  let nx = (b[1] - a[1]) / L
  let nz = -(b[0] - a[0]) / L
  const mx = (a[0] + b[0]) / 2
  const mz = (a[1] + b[1]) / 2
  if (nx * mx + nz * mz < 0) {
    nx = -nx
    nz = -nz
  }
  return [nx, nz]
}

/**
 * The infinity edges (legacy poolInfEdges): none when `infinity` is false,
 * the listed edges when it is a list, else every edge whose outward normal
 * points toward the front.
 */
export function poolInfinityEdges(outline: readonly LocalPoint[], infinity: unknown): number[] {
  if (infinity === false) return []
  const listed = Array.isArray(infinity) ? new Set(infinity.filter((i): i is number => typeof i === 'number')) : null
  const out: number[] = []
  outline.forEach((a, i) => {
    if (listed ? listed.has(i) : edgeNormal(a, outline[(i + 1) % outline.length])[1] > INFINITY_FACING) out.push(i)
  })
  return out
}

/**
 * The pool's coping outline, water outline and infinity edges. The water is
 * a true offset of the footprint by the coping width (legacy polyOffset),
 * for every shape.
 */
export function poolLayout(outline: readonly LocalPoint[], p: PoolParams): PoolLayout {
  const coping = Math.max(0, num(p.coping, POOL_COPING_FT))
  return { outer: outline, water: polyOffset(outline, -coping), infinity: poolInfinityEdges(outline, p.infinity) }
}

/**
 * The coping level, NAVD88 metres (legacy poolLevel): its fixed `elev`
 * (feet) when it has one, else just above the highest ground round it.
 */
export function poolLevel(p: PoolParams, groundRound: readonly number[]): number {
  if (typeof p.elev === 'number' && Number.isFinite(p.elev)) return ftToM(p.elev)
  return Math.max(...groundRound) + POOL_FREEBOARD_M
}

/** How deep the shell's walls run below the coping: past the lowest ground round it, and never less than 1.6 m. */
export function poolShellDepth(level: number, groundRound: readonly number[]): number {
  return Math.max(MIN_SHELL_M, level - Math.min(...groundRound) + SHELL_BELOW_GROUND_M)
}

/** The pool's parts as triangles in its frame, metres, y = 0 at the coping level. */
export interface PoolMeshes {
  readonly coping: MeshData
  /** The concrete shell from the coping down past the ground. */
  readonly shell: MeshData
  readonly floor: MeshData
  /** The tiled lining inside the water's edge, down to the floor. */
  readonly lining: MeshData
  readonly water: MeshData
  /** Sheets of water spilling over the infinity edges. */
  readonly spill: MeshData
}

/** Legacy poolMesh: coping 0.12 m thick, the shell to `depth`, floor and lining 1.4 m down, water 4 cm under the coping. */
export function poolMeshes(layout: PoolLayout, depth: number): PoolMeshes {
  const outer = toMetres(layout.outer)
  const water = toMetres(layout.water)
  const tile = toMetres(polyOffset(layout.water, 0.02 / FT))
  return {
    coping: prism(outer, water, 0.02, 0.14),
    shell: prism(outer, water, -depth + 0.02, 0.02),
    floor: prism(water, null, -POOL_WATER_DEPTH_M, -POOL_WATER_DEPTH_M + 0.06),
    lining: prism(tile, water, -POOL_WATER_DEPTH_M, 0),
    water: prism(water, null, -0.06, -0.04),
    spill: spillSheets(outer, layout.infinity, Math.min(depth - 0.1, SHEET_MAX_M)),
  }
}

const toMetres = (P: readonly LocalPoint[]): LocalPoint[] => P.map(([x, z]) => [x * FT, z * FT])

/**
 * A solid between y0 and y1 over an outline, with an optional hole: top and
 * bottom faces, the outline's sides facing out and the hole's facing in.
 */
export function prism(outer: readonly LocalPoint[], hole: readonly LocalPoint[] | null, y0: number, y1: number): MeshData {
  const mesh = emptyMesh()
  if (outer.length < 3 || y1 <= y0) return mesh
  const holed = hole !== null && hole.length >= 3
  const contour = outer.map(([x, z]) => new Vector2(x, z))
  const holes = holed ? [hole.map(([x, z]) => new Vector2(x, z))] : []
  const faces = ShapeUtils.triangulateShape(contour, holes)
  // indices run over the outline then the hole, as triangulateShape left them
  const all = [contour, ...holes].flat()
  for (const f of faces) {
    const [a, b, c] = f.map((k) => all[k])
    addPolygon(mesh, [[a.x, y1, a.y], [b.x, y1, b.y], [c.x, y1, c.y]], [0, 1, 0])
    addPolygon(mesh, [[a.x, y0, a.y], [b.x, y0, b.y], [c.x, y0, c.y]], [0, -1, 0])
  }
  sides(mesh, outer, y0, y1, 1)
  if (holed) sides(mesh, hole, y0, y1, -1)
  return mesh
}

/** Vertical faces round an outline, facing out (`face` 1) or in (-1). */
function sides(mesh: MeshData, P: readonly LocalPoint[], y0: number, y1: number, face: 1 | -1): void {
  const s = (signedArea(P) > 0 ? 1 : -1) * face
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (L < 1e-9) return
    const out: V3 = [(s * (b[1] - a[1])) / L, 0, (-s * (b[0] - a[0])) / L]
    addPolygon(mesh, [[a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]], [a[0], y0, a[1]]], out)
  })
}

/** Legacy spill sheets: each infinity edge, 3 cm outside it, from 10 cm above the coping level down `h`. */
function spillSheets(outer: readonly LocalPoint[], edges: readonly number[], h: number): MeshData {
  const mesh = emptyMesh()
  if (h <= 0) return mesh
  for (const i of edges) {
    const a = outer[i]
    const b = outer[(i + 1) % outer.length]
    if (!a || !b) continue
    const [nx, nz] = edgeNormal(a, b)
    const A: LocalPoint = [a[0] + nx * SHEET_OFFSET_M, a[1] + nz * SHEET_OFFSET_M]
    const B: LocalPoint = [b[0] + nx * SHEET_OFFSET_M, b[1] + nz * SHEET_OFFSET_M]
    addPolygon(mesh, [[A[0], 0.1, A[1]], [B[0], 0.1, B[1]], [B[0], -h, B[1]], [A[0], -h, A[1]]], [nx, 0, nz])
  }
  return mesh
}
