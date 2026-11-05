import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Box3, Raycaster, Vector2, Vector3, type Mesh, type Object3D } from 'three'
import { usePlanStore } from '../store/planStore'
import { viewPose } from './views'
import { onGround } from './frame'

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
  const scene = useThree((s) => s.scene)
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const flight = useRef<{ from: Vector3; to: Vector3; fromT: Vector3; toT: Vector3; t: number } | null>(null)

  useEffect(() => {
    if (!request || !controls) return
    const plan = usePlanStore.getState().plan
    const houses = plan.order.map((i) => plan.objects[i]).filter((o) => o.type === 'house' && !o.hidden)
    const focus = houses.length
      ? ([houses.reduce((a, o) => a + o.position.x, 0) / houses.length, houses.reduce((a, o) => a + o.position.n, 0) / houses.length] as const)
      : undefined
    const pose = viewPose(request.id, site, focus)
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
    // probes for end-to-end tests, side-by-side screenshots and the console
    const w = window as unknown as { islandale?: Record<string, unknown> }
    if (!w.islandale) return
    w.islandale.camera = () => camera.position.toArray().map((v) => +v.toFixed(2))
    w.islandale.renderInfo = () => ({ ...gl.info.render, ...gl.info.memory, programs: gl.info.programs?.length })
    // meshes and triangles in the scene itself (renderInfo only sees the last post-processing pass)
    w.islandale.sceneStats = () => {
      let meshes = 0
      let triangles = 0
      scene.traverseVisible((o) => {
        const m = o as Mesh
        if (!m.isMesh || !m.geometry) return
        meshes++
        const g = m.geometry
        triangles += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3
      })
      return { meshes, triangles: Math.round(triangles) }
    }
    // world bounds of one plan object's meshes, metres, for checks that something follows the ground
    w.islandale.boundsOf = (id: string) => {
      const box = new Box3()
      scene.traverseVisible((o) => {
        if (o.userData.objectId === id) box.expandByObject(o)
      })
      return box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() }
    }
    // a cabin's interior meshes as drawn (visible ones only), counted by part: walls, slab, stair, rail, furniture
    w.islandale.interiorStats = (id: string) => {
      const out: Record<string, number> = {}
      scene.traverseVisible((o) => {
        const part = (o as Mesh).isMesh ? o.userData.interiorPart : undefined
        if (!part) return
        let p: typeof o | null = o
        while (p && p.userData.objectId === undefined) p = p.parent
        if (p?.userData.objectId === id) out[part] = (out[part] ?? 0) + 1
      })
      return out
    }
    // which wings (mass indexes) of each building draw a rail, for checks against the old planner
    w.islandale.railedMasses = () => {
      const out: Record<string, number[]> = {}
      scene.traverseVisible((o) => {
        if (o.name !== 'rail') return
        let mass: number | undefined
        for (let p: Object3D | null = o; p; p = p.parent) {
          if (mass === undefined && typeof p.userData.mass === 'number') mass = p.userData.mass
          const id = p.userData.objectId
          if (typeof id === 'string' && mass !== undefined) {
            out[id] = [...new Set([...(out[id] ?? []), mass])].sort((a, b) => a - b)
            break
          }
        }
      })
      return out
    }
    // which edges of each wing carry a rail ({ objectId: { mass: edges } }), from the rail meshes' userData.edges
    w.islandale.railedEdges = () => {
      const out: Record<string, Record<number, number[]>> = {}
      scene.traverseVisible((o) => {
        const edges = o.userData.edges
        if (o.name !== 'rail' || !Array.isArray(edges)) return
        let mass: number | undefined
        for (let p: Object3D | null = o; p; p = p.parent) {
          if (mass === undefined && typeof p.userData.mass === 'number') mass = p.userData.mass
          const id = p.userData.objectId
          if (typeof id === 'string' && mass !== undefined) {
            const byMass = (out[id] ??= {})
            byMass[mass] = [...new Set([...(byMass[mass] ?? []), ...(edges as number[])])].sort((a, b) => a - b)
            break
          }
        }
      })
      return out
    }
    // screen points (client px, on a grid) where the nearest drawn mesh is a rail of one mass of one object, for click checks
    w.islandale.railPointsOf = (id: string, mass: number, grid = 40) => {
      const shown = (o: Object3D) => {
        for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false
        return true
      }
      const owner = (o: Object3D) => {
        let mi: number | undefined
        for (let p: Object3D | null = o; p; p = p.parent) {
          if (mi === undefined && typeof p.userData.mass === 'number') mi = p.userData.mass
          if (typeof p.userData.objectId === 'string') return { id: p.userData.objectId as string, mass: mi }
        }
        return null
      }
      const r = gl.domElement.getBoundingClientRect()
      const ray = new Raycaster()
      const out: { x: number; y: number }[] = []
      for (let i = 1; i < grid; i++)
        for (let j = 1; j < grid; j++) {
          const x = r.left + (r.width * i) / grid
          const y = r.top + (r.height * j) / grid
          if (document.elementFromPoint(x, y) !== gl.domElement) continue
          ray.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera)
          const hit = ray.intersectObject(scene, true).find((h) => (h.object as Mesh).isMesh && shown(h.object))
          const who = hit && owner(hit.object)
          if (hit && hit.object.name === 'rail' && who?.id === id && who.mass === mass) out.push({ x, y })
        }
      return out
    }
    w.islandale.look = (position: [number, number, number], target: [number, number, number], fov?: number) => {
      if (!controls) return
      flight.current = null
      if (fov && 'fov' in camera) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      camera.position.set(...position)
      controls.target.set(...target)
      controls.update()
    }
    // look at one object from a compass bearing (degrees from north, clockwise) and distance in metres
    w.islandale.focus = (id: string, bearingDeg = 180, distanceM = 14, heightM = 4) => {
      let target: Vector3 | null = null
      scene.traverse((o) => {
        if (!target && o.userData.objectId === id) target = o.getWorldPosition(new Vector3())
      })
      if (!target || !controls) return false
      const t = target as Vector3
      const b = (bearingDeg * Math.PI) / 180
      flight.current = null
      camera.position.set(t.x + Math.sin(b) * distanceM, t.y + heightM, t.z - Math.cos(b) * distanceM)
      controls.target.set(t.x, t.y + 2, t.z)
      controls.update()
      return true
    }
    // look down at a site point (metres) from the south, so a test can click the open ground around it
    w.islandale.lookAtSite = (x: number, n: number, distanceM = 30, heightM = 40) => {
      if (!controls) return false
      const [gx, gy, gz] = onGround(site.terrain, x, n)
      flight.current = null
      camera.position.set(gx, gy + heightM, gz + distanceM)
      controls.target.set(gx, gy, gz)
      controls.update()
      return true
    }
    // where a site point on the surveyed ground (metres) is on screen, in client px, or null when it is behind the camera
    w.islandale.screenOf = (x: number, n: number) => {
      camera.updateMatrixWorld()
      const p = new Vector3(...onGround(site.terrain, x, n)).project(camera)
      if (p.z > 1) return null
      const r = gl.domElement.getBoundingClientRect()
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
    }
  }, [camera, gl, controls, scene, site])

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
