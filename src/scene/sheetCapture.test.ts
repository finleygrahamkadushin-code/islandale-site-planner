import { afterEach, describe, expect, test, vi } from 'vitest'
import { OrthographicCamera, Vector3 } from 'three'
import { localToSite } from '../buildings/footprint'
import { SIDES, sideDepth, sideFacing, sideU } from '../export/sheets/sides'
import type { ElevationRequest, ElevationSide } from '../export/sheets/types'
import { ftToM } from '../site/units'
import { toScene } from './frame'
import {
  captureElevation,
  captureFrameMatrix,
  elevationCamera,
  elevationWindow,
  holdRoofs,
  imagePlan,
  imageSize,
  MAX_IMAGE_PX,
  MAX_TARGET_BYTES,
  MSAA_SAMPLES,
  PAD_FT,
  onRoofHold,
  registerElevationCapturer,
  ROOF_HOLD_GRACE_MS,
  roofsHeld,
  targetBytesPerPixel,
  type ElevationWindow,
} from './sheetCapture'

const BOX = { minX: -12, maxX: 20, minY: -3, maxY: 18, minZ: -8, maxZ: 14 }
const REQ: ElevationRequest = { objectId: 'C-0', side: 'front', pxPerFt: 20, floorM: 3 }

/** A three camera set up as the component sets it, in the capture frame (feet). */
function frameCamera(side: ElevationSide, win: ElevationWindow): OrthographicCamera {
  const c = elevationCamera(side, win)
  const cam = new OrthographicCamera(-c.halfW, c.halfW, c.halfH, -c.halfH, c.near, c.far)
  cam.position.set(...c.position)
  cam.up.set(...c.up)
  cam.lookAt(new Vector3(...c.position).add(new Vector3(...c.look)))
  cam.updateMatrixWorld()
  return cam
}

/** The building-frame (x, z) at a given u and depth, checked against sides.ts. */
function pointAt(side: ElevationSide, u: number, d: number): readonly [number, number] {
  const [fx, fz] = sideFacing(side)
  const p = [fz * u + fx * d, -fx * u + fz * d] as const
  expect(sideU(side, p)).toBeCloseTo(u)
  expect(sideDepth(side, p)).toBeCloseTo(d)
  return p
}

const ndc = (cam: OrthographicCamera, x: number, y: number, z: number) => new Vector3(x, y, z).project(cam)

describe('elevation window', () => {
  test.each(SIDES)('the %s window covers every corner of the box in u, y and depth, padded', (side) => {
    const win = elevationWindow(side, BOX)
    const corners = [BOX.minX, BOX.maxX].flatMap((x) => [BOX.minZ, BOX.maxZ].map((z) => [x, z] as const))
    const us = corners.map((p) => sideU(side, p))
    const ds = corners.map((p) => sideDepth(side, p))
    expect(win.uMin).toBeCloseTo(Math.min(...us) - PAD_FT)
    expect(win.uMax).toBeCloseTo(Math.max(...us) + PAD_FT)
    expect(win.dMin).toBeCloseTo(Math.min(...ds) - PAD_FT)
    expect(win.dMax).toBeCloseTo(Math.max(...ds) + PAD_FT)
    expect(win.yMin).toBe(BOX.minY - PAD_FT)
    expect(win.yMax).toBe(BOX.maxY + PAD_FT)
  })

  test('the front window runs along x and the right window along -z', () => {
    expect(elevationWindow('front', BOX, 0)).toMatchObject({ uMin: -12, uMax: 20, dMin: -8, dMax: 14 })
    expect(elevationWindow('right', BOX, 0)).toMatchObject({ uMin: -14, uMax: 8, dMin: -12, dMax: 20 })
  })
})

describe('elevation camera', () => {
  test.each(SIDES)('the %s camera maps the window corners to the screen corners and u to screen x', (side) => {
    const win = elevationWindow(side, BOX)
    const cam = frameCamera(side, win)
    const at = (u: number, y: number, d: number) => {
      const [x, z] = pointAt(side, u, d)
      return ndc(cam, x, y, z)
    }
    const mid = (win.dMin + win.dMax) / 2
    const lo = at(win.uMin, win.yMin, mid)
    const hi = at(win.uMax, win.yMax, mid)
    expect(lo.x).toBeCloseTo(-1)
    expect(lo.y).toBeCloseTo(-1)
    expect(hi.x).toBeCloseTo(1)
    expect(hi.y).toBeCloseTo(1)
    // larger u lands further right; nearer (larger depth) is nearer the camera
    expect(at(5, 0, mid).x).toBeGreaterThan(at(4, 0, mid).x)
    expect(at(0, 0, win.dMax).z).toBeLessThan(at(0, 0, win.dMin).z)
    // the whole depth range sits between near and far
    expect(at(0, 0, win.dMax).z).toBeGreaterThan(-1)
    expect(at(0, 0, win.dMin).z).toBeLessThan(1)
  })

  test('the front camera stands south of the building looking north (−z), up is y', () => {
    const c = elevationCamera('front', elevationWindow('front', BOX))
    expect(c.look).toEqual([-0, 0, -1])
    expect(c.position[2]).toBeGreaterThan(BOX.maxZ)
    expect(c.up).toEqual([0, 1, 0])
  })
})

describe('capture frame', () => {
  test('a building-frame point lands where localToSite and toScene put it, y in feet above the floor', () => {
    const position = { x: 31.5, n: -12.25 }
    const rotation = 37
    const floorM = 4.2
    const m = captureFrameMatrix(position, rotation, floorM)
    for (const [x, y, z] of [[10, 0, 0], [0, 8, 6], [-7.5, -2, 12]] as const) {
      const [sx, sn] = localToSite(position, rotation, [x, z])
      const want = toScene(sx, sn, floorM + ftToM(y))
      const got = new Vector3(x, y, z).applyMatrix4(m)
      expect(got.x).toBeCloseTo(want[0], 9)
      expect(got.y).toBeCloseTo(want[1], 9)
      expect(got.z).toBeCloseTo(want[2], 9)
    }
  })

  test('a camera carried into the scene by the frame still sees larger u further right', () => {
    const m = captureFrameMatrix({ x: 5, n: 9 }, -122, 2)
    const win = elevationWindow('right', BOX)
    const c = elevationCamera('right', win)
    const k = ftToM(1)
    const pos = new Vector3(...c.position).applyMatrix4(m)
    const target = new Vector3(...c.position).add(new Vector3(...c.look)).applyMatrix4(m)
    const cam = new OrthographicCamera(-c.halfW * k, c.halfW * k, c.halfH * k, -c.halfH * k, c.near * k, c.far * k)
    cam.position.copy(pos)
    cam.lookAt(target)
    cam.updateMatrixWorld()
    // on the right elevation u = -z: a point further toward the back (smaller z) is further right
    const p = (z: number) => new Vector3(20, 4, z).applyMatrix4(m).project(cam)
    expect(p(-4).x).toBeGreaterThan(p(4).x)
    expect(p(-win.uMax).x).toBeCloseTo(1)
    expect(p(-win.uMin).x).toBeCloseTo(-1)
  })
})

describe('image size', () => {
  const win: ElevationWindow = { uMin: 0, uMax: 40, yMin: -5, yMax: 25, dMin: 0, dMax: 1 }

  test('is the window at the asked pixels per foot', () => {
    expect(imageSize(win, 20, MAX_IMAGE_PX)).toEqual({ width: 800, height: 600, pxPerFt: 20 })
  })

  test('drops pixels per foot evenly when a side would be too big', () => {
    const s = imageSize(win, 400, 8000)
    expect(s.width).toBe(8000)
    expect(s.height).toBe(6000)
    expect(s.pxPerFt).toBe(200)
  })
})

describe('capturer registry', () => {
  afterEach(() => registerElevationCapturer(null))

  test('rejects until the scene registers, then hands the request to it', async () => {
    await expect(captureElevation(REQ)).rejects.toThrow('The 3D view is not ready yet')
    registerElevationCapturer(async (req) => ({ side: req.side, dataUrl: 'data:', uMin: 0, uMax: 1, yMin: 0, yMax: 1 }))
    await expect(captureElevation(REQ)).resolves.toMatchObject({ side: 'front', dataUrl: 'data:' })
    registerElevationCapturer(null)
    await expect(captureElevation(REQ)).rejects.toThrow('The 3D view is not ready yet')
  })
})

describe('imagePlan', () => {
  const win = (wFt: number, hFt: number) => ({ uMin: 0, uMax: wFt, yMin: 0, yMax: hFt, dMin: 0, dMax: 1 })
  const bytes = (p: { width: number; height: number; samples: number }) => p.width * p.height * targetBytesPerPixel(p.samples)

  test('keeps 4x multisampling for an ordinary sheet image', () => {
    const p = imagePlan(win(60, 40), 50, MAX_IMAGE_PX)
    expect(p.samples).toBe(MSAA_SAMPLES)
    expect([p.width, p.height, p.pxPerFt]).toEqual([3000, 2000, 50])
  })

  test('drops multisampling before it drops resolution', () => {
    const p = imagePlan(win(60, 40), 100, MAX_IMAGE_PX)
    expect(p.samples).toBe(0)
    expect(p.pxPerFt).toBe(100)
    expect(bytes(p)).toBeLessThanOrEqual(MAX_TARGET_BYTES)
  })

  test('lowers pixels per foot when even a plain target would pass the budget', () => {
    const p = imagePlan(win(80, 80), 100, MAX_IMAGE_PX)
    expect(p.samples).toBe(0)
    expect(p.pxPerFt).toBeLessThan(100)
    expect(bytes(p)).toBeLessThanOrEqual(MAX_TARGET_BYTES)
    expect(p.width).toBe(Math.round(80 * p.pxPerFt))
  })
})

describe('roof hold', () => {
  afterEach(() => vi.useRealTimers())

  test('roofs are held on from the first hold until a little after the last release', () => {
    vi.useFakeTimers()
    const seen: boolean[] = []
    const stop = onRoofHold(() => seen.push(roofsHeld()))
    expect(roofsHeld()).toBe(false)
    const release = holdRoofs()
    expect(roofsHeld()).toBe(true)
    release()
    expect(roofsHeld()).toBe(true)
    vi.advanceTimersByTime(ROOF_HOLD_GRACE_MS)
    expect(roofsHeld()).toBe(false)
    expect(seen).toEqual([true, false])
    stop()
  })

  test('the sides of a batch, captured one after another, keep the roofs on throughout', () => {
    vi.useFakeTimers()
    const seen: boolean[] = []
    const stop = onRoofHold(() => seen.push(roofsHeld()))
    for (let side = 0; side < 4; side++) {
      const release = holdRoofs()
      release()
      // a second release of the same hold does nothing
      release()
      vi.advanceTimersByTime(ROOF_HOLD_GRACE_MS / 4)
    }
    expect(roofsHeld()).toBe(true)
    vi.advanceTimersByTime(ROOF_HOLD_GRACE_MS)
    expect(seen).toEqual([true, false])
    stop()
  })

  test('overlapping holds release only when the last one does', () => {
    vi.useFakeTimers()
    const [a, b] = [holdRoofs(), holdRoofs()]
    a()
    vi.advanceTimersByTime(ROOF_HOLD_GRACE_MS * 2)
    expect(roofsHeld()).toBe(true)
    b()
    vi.advanceTimersByTime(ROOF_HOLD_GRACE_MS)
    expect(roofsHeld()).toBe(false)
  })
})
