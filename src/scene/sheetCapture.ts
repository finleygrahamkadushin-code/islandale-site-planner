/**
 * Elevation images from the live 3D scene. The scene registers a capturer
 * (SheetCapture inside the Canvas); the sheets ask for images through
 * `captureElevation`. The camera maths here is pure so it can be checked
 * in node against the elevation axes in sides.ts.
 *
 * The capture frame is the building frame scaled to feet on all three axes:
 * x right, z front, y up in feet above the main floor. It maps to the scene
 * by a similarity (uniform scale, a turn about y and a shift), so a camera
 * placed in it keeps its left, right, up and down in the scene.
 */
import { Matrix4 } from 'three'
import { sideFacing, sideU } from '../export/sheets/sides'
import type { ElevationImage, ElevationRequest, ElevationSide } from '../export/sheets/types'
import { ftToM } from '../site/units'
import { toScene } from './frame'

type Capturer = (req: ElevationRequest) => Promise<ElevationImage>
type Vec3 = readonly [number, number, number]

/** Room left around the building in the image, feet. */
export const PAD_FT = 1.5
/** How far beyond the nearest face the camera stands, feet. */
export const STANDOFF_FT = 10
/** Largest image side we ever ask the GPU for, pixels. */
export const MAX_IMAGE_PX = 8192
/** GPU memory one capture may take for its render target, bytes. */
export const MAX_TARGET_BYTES = 256 * 1024 * 1024
/** Multisampling for smooth edges, dropped for images too big to afford it. */
export const MSAA_SAMPLES = 4

let capturer: Capturer | null = null

/** The scene sets this while it is drawn, and clears it (null) when it goes. */
export function registerElevationCapturer(fn: Capturer | null): void {
  capturer = fn
}

export function captureElevation(req: ElevationRequest): Promise<ElevationImage> {
  if (!capturer) return Promise.reject(new Error('The 3D view is not ready yet'))
  return capturer(req)
}

/** How long the roofs stay on after a capture, ms, so the next one in a batch finds them still there. */
export const ROOF_HOLD_GRACE_MS = 250

let roofHolds = 0
let roofsForced = false
let roofRelease: ReturnType<typeof setTimeout> | null = null
const roofListeners = new Set<() => void>()

function setRoofsForced(on: boolean) {
  if (roofsForced === on) return
  roofsForced = on
  roofListeners.forEach((fn) => fn())
}

/** True while a capture needs every roof drawn, Roofs off or not: an elevation shows the building whole. */
export const roofsHeld = (): boolean => roofsForced

/** Calls `fn` whenever roofsHeld() changes; returns the unsubscribe. */
export function onRoofHold(fn: () => void): () => void {
  roofListeners.add(fn)
  return () => roofListeners.delete(fn)
}

/**
 * Draws every roof until the returned release is called (once; later calls
 * do nothing). The roofs go back as Roofs off has them a little after the
 * last hold is released, so the four sides of a batch, captured one after
 * another, keep them on throughout instead of flickering per side.
 */
export function holdRoofs(): () => void {
  if (roofRelease) clearTimeout(roofRelease)
  roofRelease = null
  roofHolds++
  setRoofsForced(true)
  let held = true
  return () => {
    if (!held) return
    held = false
    if (--roofHolds > 0) return
    roofRelease = setTimeout(() => {
      roofRelease = null
      if (roofHolds === 0) setRoofsForced(false)
    }, ROOF_HOLD_GRACE_MS)
  }
}

/** An axis-aligned box in the capture frame, feet. */
export interface FrameBox {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly minZ: number
  readonly maxZ: number
}

/** What one elevation shows: u and y as on the sheet, depth toward the viewer, all feet. */
export interface ElevationWindow {
  readonly uMin: number
  readonly uMax: number
  readonly yMin: number
  readonly yMax: number
  readonly dMin: number
  readonly dMax: number
}

/** An orthographic camera in the capture frame, feet. */
export interface ElevationCamera {
  readonly position: Vec3
  /** Unit direction the camera looks along. */
  readonly look: Vec3
  readonly up: Vec3
  readonly halfW: number
  readonly halfH: number
  readonly near: number
  readonly far: number
}

/** The window an elevation of `side` shows around a box, padded all round. */
export function elevationWindow(side: ElevationSide, box: FrameBox, padFt = PAD_FT): ElevationWindow {
  const [fx, fz] = sideFacing(side)
  const corners = [
    [box.minX, box.minZ],
    [box.maxX, box.minZ],
    [box.minX, box.maxZ],
    [box.maxX, box.maxZ],
  ] as const
  const us = corners.map((p) => sideU(side, p))
  const ds = corners.map(([x, z]) => x * fx + z * fz)
  return {
    uMin: Math.min(...us) - padFt,
    uMax: Math.max(...us) + padFt,
    yMin: box.minY - padFt,
    yMax: box.maxY + padFt,
    dMin: Math.min(...ds) - padFt,
    dMax: Math.max(...ds) + padFt,
  }
}

/** Screen right for a side, capture frame (x, z): the direction sideU grows. */
function sideRight(side: ElevationSide): readonly [number, number] {
  const [fx, fz] = sideFacing(side)
  return [fz, -fx]
}

/** The camera that shows exactly the window: outside the nearest face, looking back at the building. */
export function elevationCamera(side: ElevationSide, win: ElevationWindow): ElevationCamera {
  const [fx, fz] = sideFacing(side)
  const [rx, rz] = sideRight(side)
  const u = (win.uMin + win.uMax) / 2
  const d = win.dMax + STANDOFF_FT
  return {
    position: [rx * u + fx * d, (win.yMin + win.yMax) / 2, rz * u + fz * d],
    look: [-fx, 0, -fz],
    up: [0, 1, 0],
    halfW: (win.uMax - win.uMin) / 2,
    halfH: (win.yMax - win.yMin) / 2,
    near: STANDOFF_FT / 2,
    far: STANDOFF_FT + (win.dMax - win.dMin) + STANDOFF_FT / 2,
  }
}

/** Pixel size of the image, dropping pixels per foot evenly when a side would pass `maxPx`. */
export function imageSize(win: ElevationWindow, pxPerFt: number, maxPx: number): { width: number; height: number; pxPerFt: number } {
  const w = win.uMax - win.uMin
  const h = win.yMax - win.yMin
  const px = pxPerFt * Math.min(1, maxPx / (w * pxPerFt), maxPx / (h * pxPerFt))
  const fit = (feet: number) => Math.min(maxPx, Math.max(1, Math.round(feet * px)))
  return { width: fit(w), height: fit(h), pxPerFt: px }
}

/** Bytes a render target takes per pixel: colour and depth for each sample, and the resolved colour when multisampled. */
export const targetBytesPerPixel = (samples: number): number => (samples > 0 ? 8 * samples + 4 : 8)

/**
 * The image size and multisampling for a capture whose render target stays
 * within MAX_TARGET_BYTES: multisampled when it fits, else plain, else at
 * fewer pixels per foot.
 */
export function imagePlan(win: ElevationWindow, pxPerFt: number, maxPx: number): { width: number; height: number; pxPerFt: number; samples: number } {
  const size = imageSize(win, pxPerFt, maxPx)
  const pixels = size.width * size.height
  if (pixels * targetBytesPerPixel(MSAA_SAMPLES) <= MAX_TARGET_BYTES) return { ...size, samples: MSAA_SAMPLES }
  if (pixels * targetBytesPerPixel(0) <= MAX_TARGET_BYTES) return { ...size, samples: 0 }
  // a little under the square root, so rounding the sides up cannot pass the budget
  const k = Math.sqrt(MAX_TARGET_BYTES / (pixels * targetBytesPerPixel(0))) * 0.99
  return { ...imageSize(win, size.pxPerFt * k, maxPx), samples: 0 }
}

/**
 * Capture frame (feet, y above the floor) → scene metres for a building at
 * a site position, turned `rotationDeg`, with its main floor at `floorM` NAVD88.
 */
export function captureFrameMatrix(position: { readonly x: number; readonly n: number }, rotationDeg: number, floorM: number): Matrix4 {
  const k = ftToM(1)
  const [tx, ty, tz] = toScene(position.x, position.n, floorM)
  return new Matrix4()
    .makeTranslation(tx, ty, tz)
    .multiply(new Matrix4().makeRotationY((rotationDeg * Math.PI) / 180))
    .multiply(new Matrix4().makeScale(k, k, k))
}
