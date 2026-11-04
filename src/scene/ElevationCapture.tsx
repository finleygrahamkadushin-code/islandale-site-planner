import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import {
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  OrthographicCamera,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type Material,
  type Mesh,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three'
import { SIDES } from '../export/sheets/sides'
import type { ElevationImage, ElevationRequest } from '../export/sheets/types'
import { ftToM } from '../site/units'
import { usePlanStore } from '../store/planStore'
import {
  captureElevation,
  captureFrameMatrix,
  elevationCamera,
  elevationWindow,
  imagePlan,
  MAX_IMAGE_PX,
  registerElevationCapturer,
  type FrameBox,
} from './sheetCapture'

/** Edges sharper than this between faces are drawn; flatter ones (curved walls' facets) are not. */
const EDGE_ANGLE_DEG = 25

type Drawable = Object3D & { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean }

/** Bumps whenever the geometry's vertices are rewritten in place. */
function positionVersion(g: BufferGeometry): number {
  const pos = g.attributes.position
  if (!pos) return 0
  return 'isInterleavedBufferAttribute' in pos ? pos.data.version : pos.version
}

/** Edge lines per geometry, kept across captures and dropped when the geometry is. */
class EdgeCache {
  private readonly map = new Map<BufferGeometry, { edges: EdgesGeometry; version: number; drop: () => void }>()

  get(g: BufferGeometry): EdgesGeometry {
    const version = positionVersion(g)
    const hit = this.map.get(g)
    if (hit && hit.version === version) return hit.edges
    if (hit) this.forget(g)
    const edges = new EdgesGeometry(g, EDGE_ANGLE_DEG)
    const drop = () => this.forget(g)
    g.addEventListener('dispose', drop)
    this.map.set(g, { edges, version, drop })
    return edges
  }

  private forget(g: BufferGeometry) {
    const hit = this.map.get(g)
    if (!hit) return
    g.removeEventListener('dispose', hit.drop)
    hit.edges.dispose()
    this.map.delete(g)
  }

  dispose() {
    for (const g of [...this.map.keys()]) this.forget(g)
  }
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

const materialsOf = (m: Mesh): Material[] => (Array.isArray(m.material) ? m.material : [m.material])
/** A mesh that paints something (not an invisible pick target). */
const paints = (m: Mesh) => materialsOf(m).some((x) => x.visible && x.colorWrite && !(x.transparent && x.opacity === 0))
/** Glass and other see-through faces: drawn as edges only, so what is behind them shows. */
const seeThrough = (m: Mesh) => materialsOf(m).some((x) => x.transparent || x.opacity < 1)

/** The plan object's visible roots, every object under them, and the meshes that paint. */
function findTarget(scene: Scene, objectId: string) {
  const roots: Object3D[] = []
  scene.traverseVisible((o) => {
    if (o.userData.objectId === objectId && !roots.some((r) => isUnder(o, r))) roots.push(o)
  })
  const inside = new Set<Object3D>()
  const meshes: Mesh[] = []
  for (const r of roots) r.traverse((o) => inside.add(o))
  for (const r of roots)
    r.traverseVisible((o) => {
      const m = o as Mesh
      if (m.isMesh && m.geometry?.attributes.position && paints(m)) meshes.push(m)
    })
  return { inside, meshes }
}

function isUnder(o: Object3D, root: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (p === root) return true
  return false
}

/** Bounds of every mesh vertex in the capture frame. */
function frameBounds(meshes: readonly Mesh[], toFrame: Matrix4): FrameBox {
  const v = new Vector3()
  const m = new Matrix4()
  let [minX, minY, minZ, maxX, maxY, maxZ] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (const mesh of meshes) {
    m.multiplyMatrices(toFrame, mesh.matrixWorld)
    const pos = mesh.geometry.attributes.position
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
  return { minX, maxX, minY, maxY, minZ, maxZ }
}

function checkRequest(req: ElevationRequest) {
  if (!SIDES.includes(req.side)) throw new Error(`There is no "${String(req.side)}" elevation`)
  if (!(req.pxPerFt > 0) || !Number.isFinite(req.pxPerFt)) throw new Error('Pixels per foot must be a positive number')
  if (!Number.isFinite(req.floorM)) throw new Error('The floor level must be a number')
}

/** Paints the RGBA rows (bottom row first, as WebGL reads them) into a PNG data URL. */
function toPng(pixels: Uint8Array, width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot make the elevation image')
  const image = ctx.createImageData(width, height)
  const row = width * 4
  for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row)
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

interface Kit {
  readonly gl: WebGLRenderer
  readonly scene: Scene
  readonly edges: EdgeCache
  readonly white: MeshBasicMaterial
  readonly ink: LineBasicMaterial
}

/** Renders one elevation of a plan object as black edges on white, leaving the scene as it found it. */
async function renderElevation(kit: Kit, req: ElevationRequest): Promise<ElevationImage> {
  checkRequest(req)
  await nextFrame()
  const { gl, scene } = kit
  const o = usePlanStore.getState().plan.objects[req.objectId]
  if (!o) throw new Error(`There is no ${req.objectId} in the plan`)
  scene.updateMatrixWorld()
  const { inside, meshes } = findTarget(scene, req.objectId)
  if (!meshes.length) throw new Error(`${o.name || req.objectId} is not drawn in the 3D view; show it to draw its elevations`)

  const frame = captureFrameMatrix(o.position, o.rotation, req.floorM)
  const win = elevationWindow(req.side, frameBounds(meshes, frame.clone().invert()))
  const size = imagePlan(win, req.pxPerFt, Math.min(MAX_IMAGE_PX, gl.capabilities.maxTextureSize))
  const c = elevationCamera(req.side, win)
  const k = ftToM(1)
  const camera = new OrthographicCamera(-c.halfW * k, c.halfW * k, c.halfH * k, -c.halfH * k, c.near * k, c.far * k)
  camera.position.set(...c.position).applyMatrix4(frame)
  camera.up.set(...c.up)
  camera.lookAt(new Vector3(...c.position).add(new Vector3(...c.look)).applyMatrix4(frame))
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()

  const target = new WebGLRenderTarget(size.width, size.height, { samples: size.samples, colorSpace: SRGBColorSpace })
  const lines = new Group()
  const hidden: Object3D[] = []
  const swapped: [Mesh, Mesh['material']][] = []
  const saved = {
    target: gl.getRenderTarget(),
    autoClear: gl.autoClear,
    shadows: gl.shadowMap.enabled,
    background: scene.background,
    fog: scene.fog,
    override: scene.overrideMaterial,
  }
  try {
    // every line goes, the display style's edge lines with the rest: only the capture's own ink draws
    const listed = new Set<Object3D>(meshes)
    const drawn = new Set<Object3D>(meshes.filter((m) => !seeThrough(m)))
    scene.traverse((x) => {
      const d = x as Drawable
      const keep = d.isMesh && inside.has(d) && (drawn.has(d) || !listed.has(d))
      if ((d.isMesh || d.isLine || d.isPoints || d.isSprite) && d.visible && !keep) {
        d.visible = false
        hidden.push(d)
      }
    })
    for (const m of meshes) {
      if (drawn.has(m)) {
        swapped.push([m, m.material])
        m.material = kit.white
      }
      const edge = new LineSegments(kit.edges.get(m.geometry), kit.ink)
      edge.matrixAutoUpdate = false
      edge.matrix.copy(m.matrixWorld)
      edge.matrixWorldNeedsUpdate = true
      lines.add(edge)
    }
    scene.add(lines)
    scene.background = new Color(0xffffff)
    scene.fog = null
    scene.overrideMaterial = null
    gl.shadowMap.enabled = false
    gl.autoClear = true
    gl.setRenderTarget(target)
    gl.render(scene, camera)
    const pixels = new Uint8Array(size.width * size.height * 4)
    gl.readRenderTargetPixels(target, 0, 0, size.width, size.height, pixels)
    const dataUrl = toPng(pixels, size.width, size.height)
    return { side: req.side, dataUrl, uMin: win.uMin, uMax: win.uMax, yMin: win.yMin, yMax: win.yMax }
  } finally {
    gl.setRenderTarget(saved.target)
    gl.autoClear = saved.autoClear
    gl.shadowMap.enabled = saved.shadows
    scene.background = saved.background
    scene.fog = saved.fog
    scene.overrideMaterial = saved.override
    scene.remove(lines)
    for (const [m, material] of swapped) m.material = material
    for (const d of hidden) d.visible = true
    target.dispose()
  }
}

/** Lets the drawing sheets ask the live scene for elevation images (see sheetCapture.ts; named apart from it so the two never clash on a case-blind disk). */
export function SheetCapture() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const kit: Kit = {
      gl,
      scene,
      edges: new EdgeCache(),
      white: new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
      ink: new LineBasicMaterial({ color: 0x000000 }),
    }
    registerElevationCapturer((req) => renderElevation(kit, req))
    // probe for end-to-end tests and the console
    const w = window as unknown as { islandale?: Record<string, unknown> }
    if (w.islandale) w.islandale.captureElevation = (req: ElevationRequest) => captureElevation(req)
    return () => {
      registerElevationCapturer(null)
      if (w.islandale) delete w.islandale.captureElevation
      kit.edges.dispose()
      kit.white.dispose()
      kit.ink.dispose()
    }
  }, [gl, scene])

  return null
}
