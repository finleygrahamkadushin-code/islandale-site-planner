import type { LocalPoint } from '../../../buildings/footprint'
import type { MeshData, V3 } from '../../../buildings/geom'

/**
 * Where the faces of a 3D roof meet, read off the mesh itself, so the plan
 * draws the ridges, hips, valleys and breaks of whatever roof the scene
 * builds: box, fitted, prow or pyramid, on any outline, at any turn.
 */

/** Faces meeting at more than this are a line on the plan, degrees; less is the chords of one curved surface. */
const CREASE_DEG = 10
/** A crease rising less than this per foot of its run is level: a ridge, not a hip. */
const LEVEL_SLOPE = 0.02
/** Grid cell for finding the face under a plan point, metres. */
const CELL_M = 1
/** Creases shorter than this are left off, metres. */
const MIN_CREASE_M = 0.03

/** One face of the roof's top: its corners (metres, y up), its upward unit normal and its area on plan. */
export interface RoofFace {
  readonly p: readonly [V3, V3, V3]
  readonly n: V3
  readonly planArea: number
}

export type CreaseKind = 'ridge' | 'hip' | 'valley'

export interface Crease {
  readonly kind: CreaseKind
  readonly a: V3
  readonly b: V3
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** The roof's faces, each turned to face up (a roof mesh is a soup of triangles). */
export function roofFaces(mesh: MeshData): RoofFace[] {
  const q = mesh.positions
  const out: RoofFace[] = []
  for (let i = 0; i + 8 < q.length; i += 9) {
    const p: [V3, V3, V3] = [
      [q[i], q[i + 1], q[i + 2]],
      [q[i + 3], q[i + 4], q[i + 5]],
      [q[i + 6], q[i + 7], q[i + 8]],
    ]
    const u = sub(p[1], p[0])
    const v = sub(p[2], p[0])
    const c: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const l = Math.hypot(...c)
    if (l < 1e-12) continue
    const s = c[1] < 0 ? -1 / l : 1 / l
    out.push({ p, n: [c[0] * s, c[1] * s, c[2] * s], planArea: Math.abs(c[1]) / 2 })
  }
  return out
}

/** Faces by plan grid cell, for finding the face under a point. */
function faceIndex(faces: readonly RoofFace[]): (x: number, z: number) => RoofFace | null {
  const cells = new Map<string, number[]>()
  faces.forEach((f, i) => {
    const xs = f.p.map((p) => p[0])
    const zs = f.p.map((p) => p[2])
    for (let cx = Math.floor(Math.min(...xs) / CELL_M); cx <= Math.floor(Math.max(...xs) / CELL_M); cx++) {
      for (let cz = Math.floor(Math.min(...zs) / CELL_M); cz <= Math.floor(Math.max(...zs) / CELL_M); cz++) {
        const k = `${cx},${cz}`
        const list = cells.get(k)
        if (list) list.push(i)
        else cells.set(k, [i])
      }
    }
  })
  return (x, z) => {
    let best: RoofFace | null = null
    let bestY = -Infinity
    for (const i of cells.get(`${Math.floor(x / CELL_M)},${Math.floor(z / CELL_M)}`) ?? []) {
      const [a, b, c] = faces[i].p
      const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
      if (Math.abs(det) < 1e-14) continue
      const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det
      const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det
      const l3 = 1 - l1 - l2
      if (l1 < 0 || l2 < 0 || l3 < 0) continue
      const y = l1 * a[1] + l2 * b[1] + l3 * c[1]
      if (y > bestY) {
        best = faces[i]
        bestY = y
      }
    }
    return best
  }
}

/**
 * Every edge of the roof's faces where the faces either side of it (found
 * on plan, so T-junctions between facets still meet) turn by more than
 * CREASE_DEG: convex and level a ridge, convex and sloping a hip, concave a
 * valley. Eave edges, with nothing beyond them, are not creases.
 */
export function roofCreases(faces: readonly RoofFace[]): Crease[] {
  const under = faceIndex(faces)
  const cos = Math.cos((CREASE_DEG * Math.PI) / 180)
  const seen = new Set<string>()
  const key = (p: V3) => `${Math.round(p[0] * 1e4)},${Math.round(p[2] * 1e4)}`
  const out: Crease[] = []
  for (const f of faces) {
    for (let k = 0; k < 3; k++) {
      const a = f.p[k]
      const b = f.p[(k + 1) % 3]
      const ka = key(a)
      const kb = key(b)
      const id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      if (seen.has(id)) continue
      seen.add(id)
      const run = Math.hypot(b[0] - a[0], b[2] - a[2])
      if (run < MIN_CREASE_M) continue
      // a hair either side of the edge's middle, square across it on plan
      const e = Math.min(1e-3, run * 0.01)
      const mx = (a[0] + b[0]) / 2
      const mz = (a[2] + b[2]) / 2
      const nx = (-(b[2] - a[2]) / run) * e
      const nz = ((b[0] - a[0]) / run) * e
      const f1 = under(mx + nx, mz + nz)
      const f2 = under(mx - nx, mz - nz)
      if (!f1 || !f2 || f1 === f2 || dot(f1.n, f2.n) > cos) continue
      const c2: V3 = [(f2.p[0][0] + f2.p[1][0] + f2.p[2][0]) / 3, (f2.p[0][1] + f2.p[1][1] + f2.p[2][1]) / 3, (f2.p[0][2] + f2.p[1][2] + f2.p[2][2]) / 3]
      // convex where the other face falls away below this one's plane
      const concave = dot(f1.n, sub(c2, a)) > 0
      const level = Math.abs(b[1] - a[1]) <= LEVEL_SLOPE * run
      out.push({ kind: concave ? 'valley' : level ? 'ridge' : 'hip', a, b })
    }
  }
  return out
}

/** Join segments that meet end to end into polylines (legacy roofChain), points within eps one point. */
export function chainSegments(segs: readonly (readonly [LocalPoint, LocalPoint])[], eps: number): LocalPoint[][] {
  const key = (p: LocalPoint) => `${Math.round(p[0] / eps)}_${Math.round(p[1] / eps)}`
  const ends = new Map<string, [number, 0 | 1][]>()
  segs.forEach((s, i) =>
    ([0, 1] as const).forEach((e) => {
      const k = key(s[e])
      const list = ends.get(k)
      if (list) list.push([i, e])
      else ends.set(k, [[i, e]])
    }),
  )
  const used = new Uint8Array(segs.length)
  const next = (p: LocalPoint): [number, 0 | 1] | null => (ends.get(key(p)) ?? []).find(([i]) => !used[i]) ?? null
  const out: LocalPoint[][] = []
  segs.forEach((s, i) => {
    if (used[i]) return
    used[i] = 1
    const line: LocalPoint[] = [s[0], s[1]]
    for (const atStart of [false, true]) {
      for (;;) {
        const n = next(atStart ? line[0] : line[line.length - 1])
        if (!n) break
        used[n[0]] = 1
        const q = segs[n[0]][n[1] === 0 ? 1 : 0]
        if (atStart) line.unshift(q)
        else line.push(q)
      }
    }
    out.push(line)
  })
  return out
}

/** A polyline with the points that do not turn it (within `tol` of the line through their neighbours) left out. */
export function straighten(pts: readonly LocalPoint[], tol: number): LocalPoint[] {
  if (pts.length < 3) return [...pts]
  const out: LocalPoint[] = [pts[0]]
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = out[out.length - 1]
    const p = pts[i]
    const b = pts[i + 1]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    const off = l < 1e-9 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / l
    if (off > tol) out.push(p)
  }
  out.push(pts[pts.length - 1])
  return out
}
