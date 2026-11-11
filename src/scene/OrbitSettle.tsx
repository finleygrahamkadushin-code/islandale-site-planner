import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { dampingFor, frameStep, leftoverPx, screenPx, SETTLE_PX } from './orbitCoast'

/** The parts of drei's OrbitControls (three-stdlib) this reads and sets. */
interface Controls {
  dampingFactor: number
  enableDamping: boolean
  readonly autoRotate: boolean
  readonly target: Vector3
  update: () => boolean
  addEventListener: (type: 'start' | 'end', listener: () => void) => void
  removeEventListener: (type: 'start' | 'end', listener: () => void) => void
}

/** OrbitControls' update runs at this useFrame priority in drei; these hooks go either side of it. */
const BEFORE_CONTROLS = -2
const AFTER_CONTROLS = -0.5

/**
 * The orbit's coast after a drag (found in the R8.1 check): damped per second
 * rather than per frame, so it lasts as long on a slow machine as at 60 fps,
 * and finished in one step once what is left is under a pixel, so the view
 * stops drawing instead of creeping on.
 */
export function OrbitSettle() {
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const camera = useThree((s) => s.camera)
  const height = useThree((s) => s.size.height)
  const dragging = useRef(false)
  const timing = useRef({ last: 0, step: 1 / 60 })
  const last = useMemo(() => ({ seen: false, look: new Quaternion(), target: new Vector3() }), [])

  // a hand on the controls: never cut its coast short
  useEffect(() => {
    if (!controls) return
    const start = () => void (dragging.current = true)
    const end = () => void (dragging.current = false)
    controls.addEventListener('start', start)
    controls.addEventListener('end', end)
    return () => {
      controls.removeEventListener('start', start)
      controls.removeEventListener('end', end)
    }
  }, [controls])

  useFrame(() => {
    if (!controls) return
    const now = performance.now()
    const t = timing.current
    t.step = frameStep((now - t.last) / 1000, t.step)
    t.last = now
    controls.dampingFactor = dampingFor(t.step)
  }, BEFORE_CONTROLS)

  useFrame(() => {
    if (!controls) return
    if (last.seen && !dragging.current && !controls.autoRotate) {
      const fov = camera instanceof PerspectiveCamera ? camera.fov : 45
      const moved = screenPx(last.look.angleTo(camera.quaternion), last.target.distanceTo(controls.target), camera.position.distanceTo(controls.target), fov, height)
      if (moved > 0 && leftoverPx(moved, controls.dampingFactor) < SETTLE_PX) {
        // without damping, update() applies what is left of the coast and clears it: the camera ends where it would have
        controls.enableDamping = false
        controls.update()
        controls.enableDamping = true
      }
    }
    last.seen = true
    last.look.copy(camera.quaternion)
    last.target.copy(controls.target)
  }, AFTER_CONTROLS)

  return null
}
