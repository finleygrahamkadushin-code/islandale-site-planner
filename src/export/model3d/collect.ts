import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  FrontSide,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Vector3,
  type InstancedMesh,
  type Material,
  type Object3D,
} from 'three'
import { CURVED_SHAPES } from '../../buildings/footprint'
import { buildingMasses, type Mass } from '../../buildings/masses'
import { M_PER_FT } from '../../site/units'
import type { Plan, PlanObject } from '../../store/types'
import { isLineLike, paints } from '../sheets/elevation/sheetTarget'
import type { ObjectNode } from './manifest'
import { meshName, nodeName } from './names'
import { splitByFaceEdges } from './splitWalls'
import { meshExtras, type MeshExtras, type PieceInfo } from './tags'

/**
 * The live scene copied into a clean three.js scene for the glTF exporter:
 *   Terrain · Earthworks · Water · Objects > "<name> #<id>" > "<name> #<id>|<part>|m<mi>|e<ei>|<k>"
 * New geometry baked into each object's frame, one plain material per
 * look, every mesh named and tagged. Never changes the live scene. Leaves
 * out everything that is not the model: gizmos, handles, ghosts, contact
 * shadows, the parcel line, site marks, shore foam, lines and hidden pick
 * targets (only the named roots below and the plan group are read).
 */

export interface CollectOptions {
  /** Rooms and furniture inside the cabins, tagged `interior`. */
  readonly interiors: boolean
}

export interface Collected {
  readonly scene: Scene
  readonly nodes: readonly ObjectNode[]
  readonly meshes: number
  /** Pieces left out because they had no triangles. */
  readonly empty: number
  /** Terrain patches drawn (each fills a hole in the terrain): check_export.py counts them back. */
  readonly patches: number
}

export const ROOTS = ['Terrain', 'Earthworks', 'Water', 'Objects'] as const
const LIVE = { terrain: 'terrain', patch: 'terrain-patch', retaining: 'retaining-walls', water: 'water', plan: 'plan' } as const
/** Object types whose uvs the app writes in feet. */
const FEET_UV_TYPES = new Set(['house', 'deck', 'bridge', 'shed', 'shop'])
const DEFAULT_ROUGHNESS = 0.86
/** m: how far below the wall top a gable end may start. */
const GABLE_TOL_M = 0.02
const ROUND_M = 1e4
const r4 = (v: number): number => Math.round(v * ROUND_M) / ROUND_M

export function collectModel(live: Object3D, plan: Plan, opts: CollectOptions): Collected {
  live.updateMatrixWorld(true)
  const out = new Scene()
  const roots = Object.fromEntries(ROOTS.map((name) => [name, Object.assign(new Group(), { name })])) as Record<(typeof ROOTS)[number], Group>
  ROOTS.forEach((name) => out.add(roots[name]))
  const mat = materialCache()
  const counts = { meshes: 0, empty: 0 }

  // every object of a name: the app draws one terrain patch per reshaped area, and the terrain has a hole under each
  const addSite = (root: Group, prefix: string, name: string, extras: Record<string, unknown>) => {
    for (const src of live.getObjectsByProperty('name', name)) src.traverseVisible((m) => {
      if (!isPaintedMesh(m)) return
      const g = bake(m, m.matrixWorld, 1)
      if (!g) return void counts.empty++
      const k = root.children.length
      root.add(named(new Mesh(g, mat(m, `${extras.part}`, null, !!g.getAttribute('color'))), `${prefix}|${extras.part}|${k}`, { ...extras, k }))
      counts.meshes++
    })
  }
  addSite(roots.Terrain, 'Terrain', LIVE.terrain, { part: 'terrain', partSrc: 'planner' })
  addSite(roots.Earthworks, 'Earthworks', LIVE.patch, { part: 'earthworks', partSrc: 'planner' })
  addSite(roots.Earthworks, 'Earthworks', LIVE.retaining, { part: 'retaining', partSrc: 'planner' })
  addSite(roots.Water, 'Water', LIVE.water, { part: 'water', partSrc: 'planner' })

  const nodes: ObjectNode[] = []
  for (const root of objectRoots(live.getObjectByName(LIVE.plan))) {
    const o = plan.objects[root.userData.objectId as string]
    if (!o) continue
    const { node, info } = objectNode(o, root)
    nodes.push(info)
    roots.Objects.add(node)
    const toNode = node.matrix.clone().invert()
    const uvScale = FEET_UV_TYPES.has(o.type) ? M_PER_FT : 1
    let k = 0
    for (const piece of pieces(root, opts)) {
      const rel = toNode.clone().multiply(piece.mesh.matrixWorld)
      const g = bake(piece.mesh, rel, uvScale)
      if (!g) {
        counts.empty++
        continue
      }
      for (const part of wallParts(o, piece, g)) {
        const extras = meshExtras(o, part.info, k)
        node.add(named(new Mesh(part.geometry, mat(piece.mesh, extras.part, extras, false)), meshName(info.node, { part: extras.part, mi: extras.mi, ei: extras.ei, k }), extras))
        k++
        counts.meshes++
      }
    }
  }
  out.updateMatrixWorld(true)
  const patches = roots.Earthworks.children.filter((c) => c.userData.part === 'earthworks').length
  return { scene: out, nodes, meshes: counts.meshes, empty: counts.empty, patches }
}

// ---------- objects ----------

/** The group of every plan object, in draw order (the first `objectId` going down; nothing nests inside one). */
function objectRoots(plan: Object3D | undefined): Object3D[] {
  const found: Object3D[] = []
  const walk = (x: Object3D) => {
    if (!x.visible) return
    if (x.userData.objectId !== undefined) return void found.push(x)
    x.children.forEach(walk)
  }
  if (plan) walk(plan)
  return found
}

/** The object's node at its group's world transform (scale left out), and where that is in site terms. */
function objectNode(o: PlanObject, root: Object3D): { node: Group; info: ObjectNode } {
  const p = new Vector3()
  const q = new Quaternion()
  root.matrixWorld.decompose(p, q, new Vector3())
  const rot = r4((new Euler().setFromQuaternion(q, 'YXZ').y * 180) / Math.PI)
  const info: ObjectNode = { oid: o.id, node: nodeName(o), x: r4(p.x), n: r4(-p.z), floor: r4(p.y), rot }
  const node = Object.assign(new Group(), { name: info.node })
  node.position.set(info.x, info.floor, -info.n)
  node.quaternion.copy(q)
  node.updateMatrix()
  node.userData = { oid: o.id, name: o.name, t: o.type, x: info.x, n: info.n, rot: info.rot, floor: info.floor, grade: info.floor }
  return { node, info }
}

interface Piece {
  readonly mesh: Mesh
  readonly info: PieceInfo
  readonly faceEdges?: readonly number[]
}

/** Every drawn mesh of one object, with what its tags and the groups above it say. */
function pieces(root: Object3D, opts: CollectOptions): Piece[] {
  const out: Piece[] = []
  const walk = (x: Object3D, mi: number | undefined, interior: boolean, part: string | undefined) => {
    if (!x.visible || isLineLike(x)) return
    const inside = interior || isInteriorRoot(x)
    if (x.userData.sheetSkip && !(inside && opts.interiors)) return
    const m = typeof x.userData.mass === 'number' ? (x.userData.mass as number) : mi
    // a part tag holds for everything under it, as Paint's hit test reads it (paintHit.ts)
    const p = typeof x.userData.part === 'string' ? (x.userData.part as string) : part
    if (isPaintedMesh(x)) {
      const ud = x.userData
      const interiorPart = inside ? ((ud.interiorPart as string | undefined) ?? 'furniture') : undefined
      out.push({
        mesh: x,
        info: { part: p, interiorPart, mi: m, massWide: ud.massWide === true, drawnHex: drawnHex(x) },
        faceEdges: Array.isArray(ud.faceEdges) ? (ud.faceEdges as number[]) : undefined,
      })
    }
    x.children.forEach((c) => walk(c, m, inside, p))
  }
  walk(root, undefined, false, undefined)
  return out
}

/** The rooms group inside a cabin (InteriorMesh): skipped by the sheets, tagged interior here. */
function isInteriorRoot(x: Object3D): boolean {
  if (!x.userData.sheetSkip || x.userData.part !== undefined) return false
  let found = false
  x.traverse((c) => {
    if (c.userData.interiorPart !== undefined) found = true
  })
  return found
}

/**
 * A wall piece as the file wants it: a straight mass's walls one mesh per
 * outline edge (by the triangles' face edges), a curved mass's one wall
 * with ei 0; the ceiling drawn when there is no roof (a 'wall' with no
 * face edges) as 'cap'; a gable end (mass-wide wall cladding entirely above
 * the walls, so not on the outline) as 'gable', keeping its wall kind.
 * Anything else passes through.
 */
function wallParts(o: PlanObject, piece: Piece, g: BufferGeometry): { info: PieceInfo; geometry: BufferGeometry }[] {
  const { info } = piece
  if (info.part !== 'wall' || info.interiorPart || o.type !== 'house') return [{ info, geometry: g }]
  const mass = buildingMasses(o.params as Record<string, unknown>)[info.mi ?? 0]
  if (info.massWide) return [{ info: mass && isAboveWalls(g, mass) ? { ...info, part: 'gable' } : info, geometry: g }]
  if (!piece.faceEdges) return [{ info: { ...info, part: 'cap' }, geometry: g }]
  if (mass && (CURVED_SHAPES as readonly string[]).includes(mass.shape)) return [{ info: { ...info, ei: 0 }, geometry: g }]
  return splitByFaceEdges(g, piece.faceEdges).map(({ edge, geometry }) => ({ info: { ...info, ei: edge }, geometry }))
}

/** A gable end: all of it above the mass's wall tops (in the node frame, whose origin is the building floor). */
function isAboveWalls(g: BufferGeometry, mass: Mass): boolean {
  const pos = g.getAttribute('position')
  const top = (mass.lvl + mass.h) * M_PER_FT - GABLE_TOL_M
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < top) return false
  return pos.count > 0
}

// ---------- meshes and materials ----------

const materialsOf = (m: Mesh): Material[] => (Array.isArray(m.material) ? m.material : [m.material])
const isMesh = (x: Object3D): x is Mesh => (x as Mesh).isMesh === true
const isInstanced = (m: Mesh): m is InstancedMesh => (m as InstancedMesh).isInstancedMesh === true
const isPaintedMesh = (x: Object3D): x is Mesh => isMesh(x) && !isLineLike(x) && paints(x)

type Tinted = Material & { color?: Color; roughness?: number; metalness?: number; vertexColors?: boolean }

function drawnHex(m: Mesh): string | undefined {
  const c = (materialsOf(m)[0] as Tinted).color
  return c ? `#${c.getHexString()}` : undefined
}

function named(mesh: Mesh, name: string, extras: Record<string, unknown> | MeshExtras): Mesh {
  mesh.name = name
  mesh.userData = { ...extras }
  return mesh
}

/** One plain MeshStandardMaterial per look: part, finish, colour, see-through, sides. */
function materialCache() {
  const cache = new Map<string, MeshStandardMaterial>()
  return (src: Mesh, part: string, extras: MeshExtras | null, vertexColors: boolean): MeshStandardMaterial => {
    const s = materialsOf(src)[0] as Tinted
    const hex = vertexColors ? '#ffffff' : (extras?.color ?? (s.color ? `#${s.color.getHexString()}` : '#cccccc'))
    const variant = extras?.wallKind ?? extras?.roofMat ?? extras?.railStyle ?? ''
    const transparent = s.transparent && s.opacity < 1
    const twoSided = s.side === DoubleSide
    const key = `${part}${variant ? `-${variant}` : ''} ${vertexColors ? 'vertex' : hex}${transparent ? ` a${s.opacity.toFixed(2)}` : ''}${twoSided ? ' 2s' : ''}`
    const hit = cache.get(key)
    if (hit) return hit
    const made = new MeshStandardMaterial({
      name: key,
      color: new Color(hex),
      vertexColors,
      roughness: s.roughness ?? DEFAULT_ROUGHNESS,
      metalness: s.metalness ?? 0,
      transparent,
      opacity: transparent ? s.opacity : 1,
      side: twoSided ? DoubleSide : FrontSide,
    })
    cache.set(key, made)
    return made
  }
}

/** A mesh's geometry (instances expanded) baked by `matrix`, uvs scaled, trimmed to its draw range; null when empty. */
function bake(m: Mesh, matrix: Matrix4, uvScale: number): BufferGeometry | null {
  const base = trimmed(m.geometry)
  if (!base) return null
  if (!isInstanced(m)) return transformed(base, matrix, uvScale)
  const each = new Matrix4()
  const parts: BufferGeometry[] = []
  for (let i = 0; i < m.count; i++) {
    m.getMatrixAt(i, each)
    parts.push(transformed(base, matrix.clone().multiply(each), uvScale))
  }
  return merged(parts)
}

/** The triangles a geometry draws, as a non-indexed copy of position, normal, uv and colour. */
function trimmed(src: BufferGeometry): BufferGeometry | null {
  const pos = src.getAttribute('position')
  if (!pos || pos.count === 0) return null
  const flat = src.index ? src.toNonIndexed() : src
  const n = flat.getAttribute('position').count
  const dr = src.drawRange
  const start = src.index ? 0 : Math.max(0, dr.start | 0)
  const end = src.index || !Number.isFinite(dr.count) ? n : Math.min(n, start + dr.count)
  if (end - start < 3) return null
  const g = new BufferGeometry()
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = flat.getAttribute(name)
    if (!a) continue
    const data = new Float32Array((end - start) * a.itemSize)
    for (let i = start; i < end; i++) for (let c = 0; c < a.itemSize; c++) data[(i - start) * a.itemSize + c] = a.getComponent(i, c)
    g.setAttribute(name, new BufferAttribute(data, a.itemSize))
  }
  return g
}

function transformed(src: BufferGeometry, matrix: Matrix4, uvScale: number): BufferGeometry {
  const g = src.clone()
  g.applyMatrix4(matrix)
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  const uv = g.getAttribute('uv')
  if (uv && uvScale !== 1) for (let i = 0; i < uv.array.length; i++) (uv.array as Float32Array)[i] *= uvScale
  if (matrix.determinant() < 0) flipWinding(g)
  return g
}

function flipWinding(g: BufferGeometry): void {
  for (const a of Object.values(g.attributes)) {
    const s = a.itemSize
    const arr = a.array as Float32Array
    for (let t = 0; t + 2 < a.count; t += 3) {
      for (let c = 0; c < s; c++) {
        const i = (t + 1) * s + c
        const j = (t + 2) * s + c
        const tmp = arr[i]
        arr[i] = arr[j]
        arr[j] = tmp
      }
    }
  }
}

function merged(parts: readonly BufferGeometry[]): BufferGeometry | null {
  if (!parts.length) return null
  const g = new BufferGeometry()
  for (const name of Object.keys(parts[0].attributes)) {
    if (!parts.every((p) => p.getAttribute(name))) continue
    const size = parts[0].getAttribute(name).itemSize
    const data = new Float32Array(parts.reduce((s, p) => s + p.getAttribute(name).array.length, 0))
    let off = 0
    for (const p of parts) {
      data.set(p.getAttribute(name).array as Float32Array, off)
      off += p.getAttribute(name).array.length
    }
    g.setAttribute(name, new BufferAttribute(data, size))
  }
  return g
}
