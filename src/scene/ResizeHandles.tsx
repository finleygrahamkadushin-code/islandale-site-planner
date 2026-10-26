import { useCallback, useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Plane, Vector3 } from 'three'
import { footprintParams, siteToLocal } from '../buildings/footprint'
import { ftToM } from '../site/units'
import { isObjectLocked, usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { baseElevation } from './placement'
import type { DragState } from './editing'

const MIN_FT = 2
const HANDLE_M = 0.45

/** Corner cubes on the selected object's footprint box; dragging one resizes width and depth about the centre. */
export function ResizeHandles({ o, setDrag }: { readonly o: PlanObject; readonly setDrag: (d: DragState | null) => void }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const locked = usePlanStore((s) => isObjectLocked(s, o.id))
  const resizeObject = usePlanStore((s) => s.resizeObject)
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const live = useRef<{ w: number; d: number } | null>(null)
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), [])
  const hit = useMemo(() => new Vector3(), [])

  const base = baseElevation(terrain, o)
  const { w, d } = footprintParams(o)
  const corners: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      if (controls) controls.enabled = false
      plane.constant = -base
    },
    [controls, plane, base],
  )
  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!(e.target as Element).hasPointerCapture?.(e.pointerId)) return
      e.stopPropagation()
      if (!e.ray.intersectPlane(plane, hit)) return
      const [lx, lz] = siteToLocal(o.position, o.rotation, [hit.x, -hit.z])
      const size = { w: Math.max(MIN_FT, Math.abs(lx) * 2), d: Math.max(MIN_FT, Math.abs(lz) * 2) }
      live.current = size
      setDrag({ id: o.id, patch: (obj) => ({ params: { ...obj.params, w: size.w, d: size.d } }) })
    },
    [o.id, o.position, o.rotation, plane, hit, setDrag],
  )
  const onPointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
      if (controls) controls.enabled = true
      const size = live.current
      live.current = null
      setDrag(null)
      if (size) resizeObject(o.id, size)
    },
    [controls, o.id, resizeObject, setDrag],
  )

  if (locked || o.type === 'bridge') return null
  return (
    <group position={[o.position.x, base + HANDLE_M / 2, -o.position.n]} rotation={[0, (o.rotation * Math.PI) / 180, 0]}>
      {corners.map(([lx, lz], i) => (
        <mesh
          key={i}
          position={[ftToM(lx), 0, ftToM(lz)]}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerOver={() => (document.body.style.cursor = 'nwse-resize')}
          onPointerOut={() => (document.body.style.cursor = '')}
          renderOrder={10}
        >
          <boxGeometry args={[HANDLE_M, HANDLE_M, HANDLE_M]} />
          <meshBasicMaterial color="#ffffff" depthTest={false} />
        </mesh>
      ))}
    </group>
  )
}
