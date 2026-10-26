import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { usePlanStore } from '../store/planStore'
import { viewPose } from './views'

const DURATION_S = 0.9

interface Controls {
  target: Vector3
  update: () => void
}

/** Flies the camera to a saved view when one is requested. */
export function CameraRig() {
  const request = usePlanStore((s) => s.viewRequest)
  const site = usePlanStore((s) => s.site)
  const setEnvironment = usePlanStore((s) => s.setEnvironment)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const flight = useRef<{ from: Vector3; to: Vector3; fromT: Vector3; toT: Vector3; t: number } | null>(null)

  useEffect(() => {
    if (!request || !controls) return
    const pose = viewPose(request.id, site)
    if (pose.environment) setEnvironment(pose.environment)
    flight.current = {
      from: camera.position.clone(),
      to: new Vector3(...pose.position),
      fromT: controls.target.clone(),
      toT: new Vector3(...pose.target),
      t: 0,
    }
  }, [request, controls, camera, site, setEnvironment])

  useEffect(() => {
    // read-only probe for end-to-end tests and the console
    const w = window as unknown as { islandale?: Record<string, unknown> }
    if (!w.islandale) return
    w.islandale.camera = () => camera.position.toArray().map((v) => +v.toFixed(2))
    w.islandale.renderInfo = () => ({ ...gl.info.render, ...gl.info.memory, programs: gl.info.programs?.length })
  }, [camera, gl])

  useFrame((_, dt) => {
    const f = flight.current
    if (!f || !controls) return
    f.t = Math.min(1, f.t + dt / DURATION_S)
    const k = f.t < 0.5 ? 2 * f.t * f.t : 1 - (-2 * f.t + 2) ** 2 / 2
    camera.position.lerpVectors(f.from, f.to, k)
    controls.target.lerpVectors(f.fromT, f.toT, k)
    controls.update()
    if (f.t >= 1) flight.current = null
  })
  return null
}
