import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from 'three'

/**
 * The edges a line drawing of a mesh shows, for the elevation sheets.
 * `edgeTable` welds a geometry's triangles into edges once (positions hashed
 * as EdgesGeometry does), keeping each edge's two face normals and whether
 * the surface is shaded smooth across it. `pickEdges` then chooses, per view:
 * creases (faces meeting sharper than an angle, unless the mesh is shaded
 * smooth there, as a round post or a dome is), the outline where the surface
 * turns away from the viewer (silhouettes, which a dome or sod roof needs, as
 * it has no crease at all), and open edges (a pane's rim). Object space
 * throughout; pure, so it can be checked in node.
 */

/** Positions are welded at this many decimal places (EdgesGeometry's default). */
const WELD_DIGITS = 4
/** Vertex normals this close on both faces of an edge mean the surface is shaded smooth across it. */
const SMOOTH_DOT = 0.999
/** A smooth-shaded edge sharper than this is still drawn: shading that rounds a real corner is a modelling slip, not a curve. */
export const SMOOTH_CREASE_MAX_DEG = 70
/** Faces this close to edge-on count as edge-on (n·v is noise from float maths). */
const EDGE_ON = 1e-6

type Attribute = BufferAttribute | InterleavedBufferAttribute
type V3 = readonly [number, number, number]

/** The welded edges of one geometry, object space. */
export interface EdgeTable {
  readonly count: number
  /** Endpoints, six numbers per edge. */
  readonly ends: Float32Array
  /** The first face's normal, three per edge. */
  readonly n1: Float32Array
  /** The second face's normal, wound to agree with the first; zero on an open edge. */
  readonly n2: Float32Array
  /** 1 on an edge with one face, or more than two: always drawn. */
  readonly open: Uint8Array
  /** 1 where the vertex normals agree across the edge (the surface is shaded smooth). */
  readonly smooth: Uint8Array
}

/** One edge while the table is built. */
interface Edge {
  readonly ends: readonly number[]
  readonly n1: V3
  /** The first face ran from the lower vertex id to the higher. */
  readonly forward: boolean
  /** The first face's vertex normals at the lower and higher vertex id, if the geometry has normals. */
  readonly vn: readonly number[] | null
  faces: number
  n2: V3
  smooth: boolean
}

/** The geometry's edges and their faces, welded by position. */
export function edgeTable(g: BufferGeometry): EdgeTable {
  const pos: Attribute | undefined = g.attributes.position
  const nrm: Attribute | undefined = g.attributes.normal
  const index = g.index
  const triCount = Math.floor((index ? index.count : (pos?.count ?? 0)) / 3)
  const list: Edge[] = []
  if (!pos || !triCount) return seal(list)

  const scale = 10 ** WELD_DIGITS
  const ids = new Map<string, number>()
  const idOf = (i: number) => {
    const key = `${Math.round(pos.getX(i) * scale)},${Math.round(pos.getY(i) * scale)},${Math.round(pos.getZ(i) * scale)}`
    let id = ids.get(key)
    if (id === undefined) ids.set(key, (id = ids.size))
    return id
  }
  const vertexNormals = (lo: number, hi: number) => (nrm ? [nrm.getX(lo), nrm.getY(lo), nrm.getZ(lo), nrm.getX(hi), nrm.getY(hi), nrm.getZ(hi)] : null)
  // one number per pair of vertex ids, which never pass the vertex count
  const span = pos.count + 1
  const byKey = new Map<number, Edge>()

  for (let t = 0; t < triCount; t++) {
    const v = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k))
    const id = v.map(idOf)
    if (id[0] === id[1] || id[1] === id[2] || id[0] === id[2]) continue
    const face = faceNormal(pos, v)
    if (!face) continue
    for (let k = 0; k < 3; k++) {
      const [ia, ib, a, c] = [v[k], v[(k + 1) % 3], id[k], id[(k + 1) % 3]]
      const forward = a < c
      const [lo, hi] = forward ? [ia, ib] : [ib, ia]
      const key = Math.min(a, c) * span + Math.max(a, c)
      const e = byKey.get(key)
      if (!e) {
        const edge: Edge = { ends: [pos.getX(ia), pos.getY(ia), pos.getZ(ia), pos.getX(ib), pos.getY(ib), pos.getZ(ib)], n1: face, forward, vn: vertexNormals(lo, hi), faces: 1, n2: [0, 0, 0], smooth: false }
        byKey.set(key, edge)
        list.push(edge)
      } else if (++e.faces === 2) {
        // faces wound alike run a shared edge opposite ways; the same way means one is wound backwards
        const s = forward === e.forward ? -1 : 1
        e.n2 = [face[0] * s, face[1] * s, face[2] * s]
        const vn = vertexNormals(lo, hi)
        e.smooth = !!e.vn && !!vn && dot(e.vn, vn, 0) > SMOOTH_DOT && dot(e.vn, vn, 3) > SMOOTH_DOT
      }
    }
  }
  return seal(list)
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>, at = 0, bt = at) => a[at] * b[bt] + a[at + 1] * b[bt + 1] + a[at + 2] * b[bt + 2]

/** Unit normal of a triangle by its winding, or null when it has no area. */
function faceNormal(pos: Attribute, v: readonly number[]): V3 | null {
  const [ax, ay, az] = [pos.getX(v[0]), pos.getY(v[0]), pos.getZ(v[0])]
  const [ux, uy, uz] = [pos.getX(v[1]) - ax, pos.getY(v[1]) - ay, pos.getZ(v[1]) - az]
  const [wx, wy, wz] = [pos.getX(v[2]) - ax, pos.getY(v[2]) - ay, pos.getZ(v[2]) - az]
  const [nx, ny, nz] = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx]
  const len = Math.hypot(nx, ny, nz)
  return len > 1e-12 ? [nx / len, ny / len, nz / len] : null
}

function seal(list: readonly Edge[]): EdgeTable {
  const t = {
    count: list.length,
    ends: new Float32Array(list.length * 6),
    n1: new Float32Array(list.length * 3),
    n2: new Float32Array(list.length * 3),
    open: new Uint8Array(list.length),
    smooth: new Uint8Array(list.length),
  }
  list.forEach((e, i) => {
    t.ends.set(e.ends, i * 6)
    t.n1.set(e.n1, i * 3)
    // a third face on one edge is no surface: the edge always draws
    const two = e.faces === 2
    if (two) t.n2.set(e.n2, i * 3)
    t.open[i] = two ? 0 : 1
    t.smooth[i] = two && e.smooth ? 1 : 0
  })
  return t
}

/** Which edges to draw: creases sharper than `creaseDeg`, and, given the view direction in object space, the outline seen along it. */
export interface EdgePick {
  readonly creaseDeg: number
  /** The direction the camera looks, object space; null for creases and open edges only. */
  readonly view: V3 | null
}

/** Is edge `i` a crease: faces meeting sharper than the threshold, and not a curve shaded smooth? */
function isCrease(t: EdgeTable, i: number, cosCrease: number, cosSmoothMax: number): boolean {
  const d = dot(t.n1, t.n2, i * 3)
  if (d > cosCrease) return false
  return !t.smooth[i] || d <= cosSmoothMax
}

/** Is edge `i` on the outline seen along `v`: one face toward the viewer, the other away or edge-on? */
function isSilhouette(t: EdgeTable, i: number, v: V3): boolean {
  const snap = (x: number) => (Math.abs(x) < EDGE_ON ? 0 : x)
  const d1 = snap(dot(t.n1, v, i * 3, 0))
  const d2 = snap(dot(t.n2, v, i * 3, 0))
  return d1 * d2 <= 0 && (d1 !== 0 || d2 !== 0)
}

/** The edges to draw as line-segment positions (six numbers per segment), object space. */
export function pickEdges(t: EdgeTable, pick: EdgePick): Float32Array {
  const cosCrease = Math.cos((pick.creaseDeg * Math.PI) / 180)
  const cosSmoothMax = Math.cos((SMOOTH_CREASE_MAX_DEG * Math.PI) / 180)
  const v = pick.view ? unit(pick.view) : null
  const keep: number[] = []
  for (let i = 0; i < t.count; i++) {
    if (t.open[i] || isCrease(t, i, cosCrease, cosSmoothMax) || (v && isSilhouette(t, i, v))) keep.push(i)
  }
  const out = new Float32Array(keep.length * 6)
  keep.forEach((e, k) => out.set(t.ends.subarray(e * 6, e * 6 + 6), k * 6))
  return out
}

function unit(v: V3): V3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}
