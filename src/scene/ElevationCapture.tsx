import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  LineBasicMaterial,
  LineSegments,
  MeshBasicMaterial,
  OrthographicCamera,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type InstancedMesh,
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
  holdRoofs,
  imagePlan,
  MAX_IMAGE_PX,
  registerElevationCapturer,
  roofsHeld,
} from './sheetCapture'
import { EdgeCache, findSheetTarget, frameBounds, isDrawable, isLineLike, meshLines, seeThrough } from './sheetTarget'

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

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

/** Frames R3F needs to mount roofs that Roofs off had taken away, and build their geometry. */
const ROOF_MOUNT_FRAMES = 2

/** Draws every roof for a capture; resolves once they are in the scene, with the release. */
async function roofsOn(): Promise<() => void> {
  const already = roofsHeld()
  const release = holdRoofs()
  if (!already && usePlanStore.getState().roofsOff) for (let i = 0; i < ROOF_MOUNT_FRAMES; i++) await nextFrame()
  return release
}

/** Renders one elevation of a plan object as black edges on white, leaving the scene as it found it. */
async function renderElevation(kit: Kit, req: ElevationRequest): Promise<ElevationImage> {
  checkRequest(req)
  const release = await roofsOn()
  try {
    await nextFrame()
    return draw(kit, req)
  } finally {
    release()
  }
}

/** The capture itself, synchronous from finding the object to restoring the scene. */
function draw(kit: Kit, req: ElevationRequest): ElevationImage {
  const { gl, scene } = kit
  const o = usePlanStore.getState().plan.objects[req.objectId]
  if (!o) throw new Error(`There is no ${req.objectId} in the plan`)
  scene.updateMatrixWorld()
  const { inside, meshes } = findSheetTarget(scene, req.objectId)
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
  const look = camera.getWorldDirection(new Vector3())

  const target = new WebGLRenderTarget(size.width, size.height, { samples: size.samples, colorSpace: SRGBColorSpace })
  const lines = new Group()
  const hidden: Object3D[] = []
  const swapped: [Mesh, Mesh['material']][] = []
  // per-instance colours would tint the white fill (three multiplies them in whatever the material), so they come off for the capture
  const tinted: [InstancedMesh, InstancedBufferAttribute][] = []
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
    scene.traverse((d) => {
      // a mesh under the target that paints nothing (a pick target) may stay; one that paints stays only to be filled white
      const keep = (d as Mesh).isMesh && inside.has(d) && (drawn.has(d) || (!listed.has(d) && !isLineLike(d)))
      if (isDrawable(d) && d.visible && !keep) {
        d.visible = false
        hidden.push(d)
      }
    })
    for (const m of meshes) {
      if (drawn.has(m)) {
        swapped.push([m, m.material])
        m.material = kit.white
        const inst = m as InstancedMesh
        if (inst.isInstancedMesh && inst.instanceColor) {
          tinted.push([inst, inst.instanceColor])
          inst.instanceColor = null
        }
      }
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(meshLines(m, look, kit.edges.get(m.geometry)), 3))
      const edge = new LineSegments(g, kit.ink)
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
    for (const l of lines.children) (l as LineSegments).geometry.dispose()
    for (const [m, material] of swapped) m.material = material
    for (const [m, colour] of tinted) m.instanceColor = colour
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
