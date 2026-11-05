import { Matrix4, Vector3, type BufferGeometry, type InstancedMesh, type Material, type Mesh, type Object3D } from 'three'
import { edgeTable, pickEdges, type EdgeTable } from './edgeTable'
import type { FrameBox } from './sheetCapture'

/**
 * What an elevation of one plan object draws, picked from the live scene,
 * and the lines it draws for each mesh. Tags the capture reads (userData):
 *
 * - `objectId`: the plan object a subtree draws (BuildingMesh and the rest).
 * - `sheetOwner`: drawn with that plan object's elevation though it is not
 *   part of it: the retaining walls holding back its cut, its door
 *   thresholds. Not `objectId`, so picking, paint and the camera never take
 *   it for the object itself.
 * - `sheetSkip`: never in an elevation: the rooms inside (seen through the
 *   windows otherwise), sod-roof tufts and other dressing.
 *
 * Every other mesh under a drawn subtree is drawn: white, with its edges.
 */

/** Edges sharper than this between faces are drawn; flatter ones (curved walls' facets) are not. */
export const EDGE_ANGLE_DEG = 25

const materialsOf = (m: Mesh): Material[] => (Array.isArray(m.material) ? m.material : [m.material])
/** A mesh that paints something (not an invisible pick target). */
export const paints = (m: Mesh): boolean => materialsOf(m).some((x) => x.visible && x.colorWrite && !(x.transparent && x.opacity === 0))
/** Glass and other see-through faces: drawn as edges only, so what is behind them shows. */
export const seeThrough = (m: Mesh): boolean => materialsOf(m).some((x) => x.transparent || x.opacity < 1)
const isInstanced = (m: Mesh): m is InstancedMesh => (m as InstancedMesh).isInstancedMesh === true

type Flags = { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean; isLine2?: boolean; isLineSegments2?: boolean; isWireframe?: boolean; material?: unknown }

/**
 * Lines of any kind: plain ones, and the screen-space fat lines (Line2,
 * LineSegments2, Wireframe; drei's Edges in the Sketch style) that are
 * meshes of instanced quads, which would draw as white boxes if filled.
 */
export function isLineLike(o: Object3D): boolean {
  const f = o as Object3D & Flags
  if (f.isLine || f.isLine2 || f.isLineSegments2 || f.isWireframe) return true
  const ms = Array.isArray(f.material) ? f.material : [f.material]
  return ms.some((x) => (x as { isLineMaterial?: boolean } | undefined)?.isLineMaterial === true)
}

/** Draws something on its own: a mesh, a line, points or a sprite (a group draws nothing itself). */
export function isDrawable(o: Object3D): boolean {
  const f = o as Object3D & Flags
  return !!(f.isMesh || f.isPoints || f.isSprite) || isLineLike(o)
}

/** Does this object draw with `objectId`'s elevation (as its own subtree, or as something it owns)? */
const drawsWith = (o: Object3D, objectId: string) => o.userData.objectId === objectId || o.userData.sheetOwner === objectId

/** Visits every visible object under `root`, skipping whole subtrees `skip` says no to. */
function walk(root: Object3D, visit: (o: Object3D) => boolean | void) {
  if (!root.visible || root.userData.sheetSkip) return
  if (visit(root) === false) return
  for (const c of root.children) walk(c, visit)
}

export interface SheetTarget {
  /** Every object under the drawn subtrees, visible or not, except skipped ones: the capture hides everything else. */
  readonly inside: ReadonlySet<Object3D>
  /** The visible meshes that paint, to draw white with their edges (see-through ones as edges only). */
  readonly meshes: readonly Mesh[]
}

/** The plan object's visible subtrees and what it owns, every object under them, and the meshes that paint. */
export function findSheetTarget(scene: Object3D, objectId: string): SheetTarget {
  const roots: Object3D[] = []
  walk(scene, (o) => {
    if (!drawsWith(o, objectId)) return
    roots.push(o)
    // the subtree is taken whole
    return false
  })
  const inside = new Set<Object3D>()
  const meshes: Mesh[] = []
  const all = (o: Object3D) => {
    if (o.userData.sheetSkip) return
    inside.add(o)
    o.children.forEach(all)
  }
  for (const r of roots) {
    all(r)
    walk(r, (o) => {
      const m = o as Mesh
      if (m.isMesh && !isLineLike(m) && m.geometry?.attributes.position && paints(m)) meshes.push(m)
    })
  }
  return { inside, meshes }
}

/** Where each copy of a mesh is drawn, relative to the mesh: one identity for a plain mesh, the instance matrices for an instanced one. */
export function copiesOf(m: Mesh): Matrix4[] {
  if (!isInstanced(m)) return [new Matrix4()]
  return Array.from({ length: m.count }, (_, i) => {
    const M = new Matrix4()
    m.getMatrixAt(i, M)
    return M
  })
}

/** Bounds of every mesh vertex (each instance's, for instanced meshes) in the capture frame. */
export function frameBounds(meshes: readonly Mesh[], toFrame: Matrix4): FrameBox {
  const v = new Vector3()
  const m = new Matrix4()
  let [minX, minY, minZ, maxX, maxY, maxZ] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position
    for (const copy of copiesOf(mesh)) {
      m.multiplyMatrices(toFrame, mesh.matrixWorld).multiply(copy)
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m)
        minX = Math.min(minX, v.x)
        maxX = Math.max(maxX, v.x)
        minY = Math.min(minY, v.y)
        maxY = Math.max(maxY, v.y)
        minZ = Math.min(minZ, v.z)
        maxZ = Math.max(maxZ, v.z)
      }
    }
  }
  return { minX, maxX, minY, maxY, minZ, maxZ }
}

/** Bumps whenever the geometry's vertices are rewritten in place. */
function positionVersion(g: BufferGeometry): number {
  const pos = g.attributes.position
  if (!pos) return 0
  return 'isInterleavedBufferAttribute' in pos ? pos.data.version : pos.version
}

/** Each geometry's edge table, kept across captures (the edges a view draws depend on the side, the table does not) and dropped with the geometry. */
export class EdgeCache {
  private readonly map = new Map<BufferGeometry, { table: EdgeTable; version: number; drop: () => void }>()

  get(g: BufferGeometry): EdgeTable {
    const version = positionVersion(g)
    const hit = this.map.get(g)
    if (hit && hit.version === version) return hit.table
    if (hit) this.forget(g)
    const table = edgeTable(g)
    const drop = () => this.forget(g)
    g.addEventListener('dispose', drop)
    this.map.set(g, { table, version, drop })
    return table
  }

  private forget(g: BufferGeometry) {
    const hit = this.map.get(g)
    if (!hit) return
    g.removeEventListener('dispose', hit.drop)
    this.map.delete(g)
  }

  dispose() {
    for (const g of [...this.map.keys()]) this.forget(g)
  }
}

/**
 * The lines one mesh draws when seen looking along `look` (world space):
 * its creases and its outline from that side, for every copy of an
 * instanced mesh, as line-segment positions in the mesh's own space.
 */
export function meshLines(m: Mesh, look: Vector3, table: EdgeTable): Float32Array {
  const parts: Float32Array[] = []
  const toLocal = new Matrix4()
  const v = new Vector3()
  const p = new Vector3()
  for (const copy of copiesOf(m)) {
    // the inverse carries the view into the copy's space; the sign of n·v is all a face's side needs, so any scale is fine
    toLocal.multiplyMatrices(m.matrixWorld, copy).invert()
    v.copy(look).transformDirection(toLocal)
    const lines = pickEdges(table, { creaseDeg: EDGE_ANGLE_DEG, view: [v.x, v.y, v.z] })
    if (copy.equals(IDENTITY)) parts.push(lines)
    else {
      for (let i = 0; i < lines.length; i += 3) p.fromArray(lines, i).applyMatrix4(copy).toArray(lines, i)
      parts.push(lines)
    }
  }
  if (parts.length === 1) return parts[0]
  const out = new Float32Array(parts.reduce((n, x) => n + x.length, 0))
  parts.reduce((at, x) => (out.set(x, at), at + x.length), 0)
  return out
}

const IDENTITY = new Matrix4()
