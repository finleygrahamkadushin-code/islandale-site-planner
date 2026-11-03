import { Color, IcosahedronGeometry } from 'three'
import { num, signedArea, type LocalPoint } from '../buildings/footprint'
import { pointInPolygon } from '../buildings/foundation'
import { seededRandom, treeSeed } from '../scene/treeShapes'

/**
 * Site objects drawn as themselves (legacy E-series earth objects and the
 * pad's cars): the meadow's grass tufts and flowers scattered over its
 * outline (legacy scatterIn / meadowMarks), a boulder's seeded cluster of
 * rocks (boulderRocks, earthObjMesh) and the cars parked on a pad
 * (makeMesh). Pure: outlines in, marks and triangles out, in the object's
 * own frame in metres (x right, y up, z front), so the scene only places them.
 */

const FT = 0.3048

/**
 * An earth object's seed: its own `seed` (legacy o.seed), else one made
 * from its id, so a meadow or boulder keeps its look across reloads and
 * while it is dragged. (The old planner fell back to its running object id.)
 */
export function objectSeed(params: Readonly<Record<string, unknown>>, id: string): number {
  const s = params.seed
  // legacy (o.seed || 1): a seed of 0 is seed 1
  return typeof s === 'number' && Number.isFinite(s) ? s || 1 : treeSeed(id)
}

// ---------- meadow ----------

/** Grass tufts per square metre of meadow, and the most one meadow gets (legacy meadowMarks). */
export const MEADOW_TUFTS_PER_M2 = 2.6
export const MEADOW_MAX_TUFTS = 1800
/** Flowers per square metre when the meadow has no `flowers` of its own, and the most it gets. */
export const MEADOW_FLOWERS_PER_M2 = 1.6
export const MEADOW_MAX_FLOWERS = 1100
/** scatterIn gives up after this many tries per point asked for. */
const SCATTER_TRIES = 8
const GRASS = ['#a9c46e', '#c6c27e', '#98b862', '#b9bd74', '#d3c88c'] as const
/** Camas, lupine, buttercup, yarrow and paintbrush (legacy FLOWERS). */
export const FLOWERS = ['#6b63c9', '#8a6fd1', '#e9c93f', '#f1eee2', '#d4553a', '#e9c93f', '#6b63c9'] as const

/** A tuft: a cone of base radius 0.14 m and height 0.3 m, five sides (before its own scale). */
export const TUFT_CONE = { radius: 0.14, height: 0.3, sides: 5 } as const
/** A flower head: an icosahedron of radius 0.075 m. */
export const FLOWER_HEAD_M = 0.075

/** One grass tuft or flower head, in the meadow's frame. */
export interface MeadowMark {
  /** Local metres: x right, z front. */
  readonly x: number
  readonly z: number
  /** Its centre's height above the ground there, metres. */
  readonly lift: number
  readonly scale: readonly [number, number, number]
  /** Euler turn (x, y, z order), radians. */
  readonly turn: readonly [number, number, number]
  readonly color: string
}

export interface MeadowMarks {
  /** The meadow's area, square metres. */
  readonly area: number
  readonly tufts: readonly MeadowMark[]
  readonly flowers: readonly MeadowMark[]
}

/**
 * Up to `count` points spread at random inside `poly` (legacy scatterIn):
 * random points in its box, kept when inside, giving up after 8 tries per
 * point. Units are the outline's own.
 */
export function scatterIn(poly: readonly LocalPoint[], count: number, rnd: () => number): LocalPoint[] {
  if (poly.length < 3 || count <= 0) return []
  const xs = poly.map((p) => p[0])
  const zs = poly.map((p) => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const z0 = Math.min(...zs)
  const z1 = Math.max(...zs)
  const out: LocalPoint[] = []
  for (let tries = 0; out.length < count && tries < count * SCATTER_TRIES; tries++) {
    const x = x0 + rnd() * (x1 - x0)
    const z = z0 + rnd() * (z1 - z0)
    if (pointInPolygon(poly, x, z)) out.push([x, z])
  }
  return out
}

/**
 * The meadow's grass tufts and flowers over its outline (legacy meadowMarks
 * plus the per-mark sizes and turns earthObjMesh drew them with), in the
 * same random order, so a seed gives the old planner's scatter. `outlineFt`
 * is the meadow's footprint in local feet; `flowers` is flowers per m²
 * (legacy o.flowers, default 1.6).
 */
export function meadowMarks(outlineFt: readonly LocalPoint[], seed: number, flowers: unknown = MEADOW_FLOWERS_PER_M2): MeadowMarks {
  const poly = outlineFt.map(([x, z]): LocalPoint => [x * FT, z * FT])
  const area = Math.abs(signedArea(poly))
  const perM2 = Math.max(0, num(flowers, MEADOW_FLOWERS_PER_M2))
  const rnd = seededRandom(seed * 7919 + 11)
  const tuftAt = scatterIn(poly, Math.min(MEADOW_MAX_TUFTS, Math.round(area * MEADOW_TUFTS_PER_M2)), rnd)
  const flowerAt = scatterIn(poly, Math.min(MEADOW_MAX_FLOWERS, Math.round(area * perM2)), rnd).map(
    ([x, z]) => [x, z, FLOWERS[Math.floor(rnd() * FLOWERS.length)]] as const,
  )
  const tufts = tuftAt.map(([x, z]): MeadowMark => {
    const s = 0.6 + rnd() * 0.9
    const sy = s * (0.7 + rnd() * 0.6)
    const ry = rnd() * 6
    const tx = (rnd() - 0.5) * 0.4
    const tz = (rnd() - 0.5) * 0.4
    return { x, z, lift: 0.12 * s, scale: [s, sy, s], turn: [tx, ry, tz], color: GRASS[Math.floor(rnd() * GRASS.length)] }
  })
  const flowerMarks = flowerAt.map(([x, z, color]): MeadowMark => {
    const s = 0.7 + rnd() * 0.8
    return { x, z, lift: 0.28 + rnd() * 0.14, scale: [s, s * 0.8, s], turn: [0, 0, 0], color }
  })
  return { area, tufts, flowers: flowerMarks }
}

// ---------- boulders ----------

/** Most and fewest rocks in a boulder cluster (legacy boulderRocks). */
export const BOULDER_MAX_ROCKS = 7
const BOULDER_GREYS = ['#9b978f', '#8d8a83', '#a39b8e', '#87857f'] as const
const LICHEN = '#8f9c72'

/** One rock of a boulder cluster, in the boulder's frame (metres, y up from the rock's own centre). */
export interface Rock {
  /** Where the rock sits in the cluster, metres. */
  readonly cx: number
  readonly cz: number
  /** Its semi-axes before the jitter, metres. */
  readonly sx: number
  readonly sy: number
  readonly sz: number
  /** Flat-shaded triangles, cluster offset included, and a linear RGB colour per vertex. */
  readonly positions: readonly number[]
  readonly normals: readonly number[]
  readonly colors: readonly number[]
}

export interface BoulderSize {
  readonly w: unknown
  readonly d: unknown
  readonly h: unknown
  readonly count?: unknown
}

/**
 * A boulder as its seeded cluster of rocks inside w × d × h (legacy
 * boulderRocks and earthObjMesh): one big rock and up to six smaller ones
 * round it, each a jittered icosahedron flattened underneath, coloured
 * stone grey with lichen on the faces that look up and a shade under.
 * `count` (1–7) fixes the number of rocks; otherwise it is 1–3, one more
 * for a big boulder. Random order as the old planner's.
 */
export function boulderRocks(size: BoulderSize, seed: number): Rock[] {
  const R = seededRandom(seed * 9973 + 7)
  const W = Math.max(0.6, num(size.w, 0) * FT)
  const D = Math.max(0.6, num(size.d, 0) * FT)
  const H = Math.max(0.3, (num(size.h, 0) || 4) * FT)
  const asked = typeof size.count === 'number' && Number.isFinite(size.count) ? size.count : 1 + Math.floor(R() * 3) + (W * D > 14 ? 1 : 0)
  const n = Math.ceil(Math.max(1, Math.min(BOULDER_MAX_ROCKS, asked)))
  const rocks: Rock[] = []
  for (let k = 0; k < n; k++) {
    const f = k === 0 ? 1 : 0.32 + R() * 0.3
    const sx = W * 0.42 * f * (0.85 + R() * 0.3)
    const sz = D * 0.42 * f * (0.85 + R() * 0.3)
    const sy = H * 0.62 * f * (0.8 + R() * 0.4)
    let cx = 0
    let cz = 0
    if (k > 0) {
      const a = R() * Math.PI * 2
      cx = Math.cos(a) * (W * 0.42 + sx * 0.35) * (0.75 + R() * 0.3)
      cz = Math.sin(a) * (D * 0.42 + sz * 0.35) * (0.75 + R() * 0.3)
    }
    const jitterSeed = R() * 1000
    const ry = R() * Math.PI * 2
    const positions = rockShape({ cx, cz, sx, sy, sz }, jitterSeed, ry)
    const normals = faceNormals(positions)
    const lichen = R()
    rocks.push({ cx, cz, sx, sy, sz, positions, normals, colors: rockColours(normals, seededRandom(k * 31 + seed), lichen) })
  }
  return rocks
}

/** The legacy rock: an icosahedron (one subdivision) jittered per corner, flattened below and squashed on top, turned by ry. */
function rockShape(r: { cx: number; cz: number; sx: number; sy: number; sz: number }, jitterSeed: number, ry: number): number[] {
  const ico = new IcosahedronGeometry(1, 1)
  const p = ico.getAttribute('position')
  const cr = Math.cos(ry)
  const sr = Math.sin(ry)
  const out: number[] = []
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    // the same jitter for coincident corners, so the faces stay closed
    const hsh = Math.sin(Math.round(x * 50) * 12.9898 + Math.round(y * 50) * 78.233 + Math.round(z * 50) * 37.719 + jitterSeed) * 43758.5453
    const j = 0.82 + (hsh - Math.floor(hsh)) * 0.36
    const X = x * j * r.sx
    let Y = y * j * r.sy
    const Z = z * j * r.sz
    if (Y < -0.3 * r.sy) Y = -0.3 * r.sy
    if (Y > 0.55 * r.sy) Y = 0.55 * r.sy + (Y - 0.55 * r.sy) * 0.5
    out.push(r.cx + X * cr + Z * sr, Y, r.cz - X * sr + Z * cr)
  }
  ico.dispose()
  return out
}

/** One normal per triangle, repeated on its three corners (flat shading, like computeVertexNormals on unindexed triangles). */
function faceNormals(pos: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < pos.length; i += 9) {
    const ux = pos[i + 3] - pos[i]
    const uy = pos[i + 4] - pos[i + 1]
    const uz = pos[i + 5] - pos[i + 2]
    const vx = pos[i + 6] - pos[i]
    const vy = pos[i + 7] - pos[i + 1]
    const vz = pos[i + 8] - pos[i + 2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz)
    if (l < 1e-12) [nx, ny, nz] = [0, 1, 0]
    else [nx, ny, nz] = [nx / l, ny / l, nz / l]
    out.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
  }
  return out
}

/** A grey per face, some upward faces greened with lichen, faces looking down shaded (legacy earthObjMesh). */
function rockColours(normals: readonly number[], rr: () => number, lichen: number): number[] {
  const out: number[] = []
  const moss = new Color(LICHEN)
  const c = new Color()
  for (let i = 0; i < normals.length; i += 9) {
    c.set(BOULDER_GREYS[Math.floor(rr() * BOULDER_GREYS.length)])
    const ny = normals[i + 1]
    if (ny > 0.55 && rr() < 0.35 + lichen * 0.3) c.lerp(moss, 0.45)
    if (ny < -0.2) c.multiplyScalar(0.8)
    out.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b)
  }
  return out
}

/**
 * How high a rock's centre sits above the boulder's base (legacy
 * earthObjMesh): the lowest ground under its middle and four points
 * 0.7 of the way to its sides, plus a fifth of its height, so it beds into
 * a slope. `groundAt` takes local metres and gives metres above the base.
 */
export function rockSeat(rock: Pick<Rock, 'cx' | 'cz' | 'sx' | 'sy' | 'sz'>, groundAt: (x: number, z: number) => number): number {
  const probes: readonly (readonly [number, number])[] = [[0, 0], [rock.sx * 0.7, 0], [-rock.sx * 0.7, 0], [0, rock.sz * 0.7], [0, -rock.sz * 0.7]]
  const low = Math.min(...probes.map(([dx, dz]) => groundAt(rock.cx + dx, rock.cz + dz)))
  return low + rock.sy * 0.2
}

// ---------- cars on a parking pad ----------

/** Legacy car: a 1.85 × 0.6 × 4.4 m body, a 1.65 × 0.55 × 2.3 m cabin, four 0.33 m wheels. */
export const CAR = {
  body: { w: 1.85, h: 0.6, l: 4.4, y: 0.5 },
  cabin: { w: 1.65, h: 0.55, l: 2.3, y: 1.05, z: -0.2 },
  wheel: { r: 0.33, t: 0.22, x: 0.8, z: 1.4 },
} as const
/** Each car needs a bay at least this wide, metres, and a pad holds at most this many (legacy makeMesh). */
export const CAR_BAY_MIN_M = 2.3
export const MAX_CARS = 8

/**
 * Where the cars on a pad `wFt` wide stand: their centres across its width,
 * local metres, in equal bays, nose to the front (legacy makeMesh). As many
 * as asked for that fit a 2.3 m bay, at most 8. (The old planner drew none
 * at all when they did not all fit.)
 */
export function carSlots(wFt: unknown, cars: unknown): number[] {
  const W = num(wFt, 0) * FT
  const asked = Math.trunc(num(cars, 0))
  const n = Math.max(0, Math.min(MAX_CARS, asked, Math.floor(W / CAR_BAY_MIN_M + 1e-9)))
  if (n === 0) return []
  const bay = W / n
  return Array.from({ length: n }, (_, i) => -W / 2 + bay * (i + 0.5))
}

export interface CarPose {
  /** Height of the car's base (the bottom of its wheels) above the pad's base, metres. */
  readonly y: number
  /** Turns about the car's own x (nose up or down) and z (tilted to a side), radians. */
  readonly pitch: number
  readonly roll: number
}

/**
 * A car at `x` across the pad, resting on the pad's top under its four
 * wheels: its base at their mean, tilted to follow them. `topAt` takes
 * local metres and gives the pad's top, metres above its base. (The old
 * planner set every car level at the pad's centre height.)
 */
export function carPose(x: number, topAt: (x: number, z: number) => number): CarPose {
  const { x: wx, z: wz } = CAR.wheel
  const fl = topAt(x - wx, wz)
  const fr = topAt(x + wx, wz)
  const bl = topAt(x - wx, -wz)
  const br = topAt(x + wx, -wz)
  const front = (fl + fr) / 2
  const back = (bl + br) / 2
  const left = (fl + bl) / 2
  const right = (fr + br) / 2
  return { y: (fl + fr + bl + br) / 4, pitch: -Math.atan2(front - back, 2 * wz), roll: Math.atan2(right - left, 2 * wx) }
}
