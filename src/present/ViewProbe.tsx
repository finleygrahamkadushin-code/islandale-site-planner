import { useEffect } from 'react'
import { addAfterEffect, invalidate, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Vector3 } from 'three'
import { usePlanStore } from '../store/planStore'
import { SAVED_VIEWS } from '../scene/views'
import { facingNorth, headingDeg, looksStraightDown, metresPerPixel } from './viewMaths'
import { useSplash, useViewHud } from './viewState'
import { downloadBlob, snapshotName } from './snapshot'
import { markFirstFrame } from '../scene/perfProbe'

/** Changes smaller than these don't redraw the compass or scale bar. */
const HEADING_STEP_DEG = 0.5
const SCALE_STEP = 0.02
/** If shaders never report compiled (some software renderers), the splash still goes. */
const SPLASH_FALLBACK_MS = 10_000

interface Controls {
  readonly target: Vector3
  update: () => void
}

/** Run `f` once, right after the next frame is drawn (post-processing included); asks for that frame, as the view only draws on demand. */
function afterNextFrame(f: () => void): void {
  const stop = addAfterEffect(() => {
    stop()
    f()
  })
  invalidate()
}

/**
 * Inside the 3D view (4D): reads the camera for the compass and scale bar,
 * turns the view to face north on request, takes the PNG snapshot, and
 * clears the loading splash once the shaders are compiled and a frame is drawn.
 */
export function ViewProbe() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const look = new Vector3()

  useFrame(() => {
    if (!controls) return
    camera.getWorldDirection(look)
    const heading = headingDeg(look.x, look.z)
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 45
    const mPerPx = metresPerPixel(camera.position.distanceTo(controls.target), fov, size.height)
    const hud = useViewHud.getState()
    const turned = Math.abs(((heading - hud.headingDeg + 540) % 360) - 180) > HEADING_STEP_DEG
    const scaled = Math.abs(mPerPx - hud.mPerPx) / hud.mPerPx > SCALE_STEP
    const exact = looksStraightDown(look.y)
    if (turned || scaled || exact !== hud.exact) hud.set({ headingDeg: heading, mPerPx, exact })
  })

  // face north: due south of the target, same height and distance
  const north = useViewHud((s) => s.northRequest)
  useEffect(() => {
    if (!north || !controls) return
    const to = facingNorth(camera.position.toArray(), controls.target.toArray())
    camera.position.set(...to)
    controls.update()
    invalidate()
  }, [north, camera, controls])

  // the snapshot: the canvas right after the next frame is drawn, before the browser clears it
  const shot = useViewHud((s) => s.snapshotRequest)
  useEffect(() => {
    if (!shot) return
    afterNextFrame(() =>
      gl.domElement.toBlob((blob) => {
        if (!blob) return usePlanStore.getState().showToast('The picture could not be saved')
        const id = usePlanStore.getState().viewRequest?.id
        const label = SAVED_VIEWS.find((v) => v.id === id)?.label ?? null
        downloadBlob(blob, snapshotName(label, new Date()))
      }, 'image/png'),
    )
  }, [shot, gl])

  // the splash: shaders compiled, then one frame drawn
  useEffect(() => {
    let done = false
    const ready = () => {
      if (done) return
      done = true
      afterNextFrame(() => {
        markFirstFrame()
        useSplash.getState().setReady()
      })
    }
    const fallback = window.setTimeout(ready, SPLASH_FALLBACK_MS)
    gl.compileAsync(scene, camera).then(ready, ready)
    return () => window.clearTimeout(fallback)
    // once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
