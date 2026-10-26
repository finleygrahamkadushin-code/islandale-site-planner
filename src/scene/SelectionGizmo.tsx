import { useEffect, useMemo, useRef } from 'react'
import { PivotControls } from '@react-three/drei'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { isObjectLocked, usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { baseElevation } from './placement'
import type { DragState } from './editing'

const Y_AXIS = new Vector3(0, 1, 0)
const UNIT = new Vector3(1, 1, 1)

interface LiveTransform {
  readonly x: number
  readonly n: number
  readonly rotation: number
}

/**
 * Move (ground-plane handle) and rotate (ring) gizmo for the single selected,
 * unlocked object. The object follows the pointer live through `setDrag`; the
 * store is written once, on release, as one undo step.
 */
export function SelectionGizmo({ o, setDrag }: { readonly o: PlanObject; readonly setDrag: (d: DragState | null) => void }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const locked = usePlanStore((s) => isObjectLocked(s, o.id))
  const transformObject = usePlanStore((s) => s.transformObject)
  const matrix = useMemo(() => new Matrix4(), [])
  const live = useRef<LiveTransform | null>(null)
  const scratch = useMemo(() => ({ p: new Vector3(), q: new Quaternion(), s: new Vector3(), e: new Euler() }), [])

  const base = baseElevation(terrain, o)
  useEffect(() => {
    if (live.current) return
    matrix.compose(new Vector3(o.position.x, base, -o.position.n), new Quaternion().setFromAxisAngle(Y_AXIS, (o.rotation * Math.PI) / 180), UNIT)
  }, [matrix, o.position.x, o.position.n, o.rotation, base])

  if (locked || o.type === 'bridge') return null

  const onDrag = (local: Matrix4) => {
    local.decompose(scratch.p, scratch.q, scratch.s)
    const x = scratch.p.x
    const n = -scratch.p.z
    const rotation = (scratch.e.setFromQuaternion(scratch.q, 'YXZ').y * 180) / Math.PI
    const y = baseElevation(terrain, { ...o, position: { x, n }, rotation })
    // keep the gizmo on the ground and its rotation about y only
    matrix.compose(scratch.p.set(x, y, -n), scratch.q.setFromAxisAngle(Y_AXIS, (rotation * Math.PI) / 180), UNIT)
    live.current = { x, n, rotation }
    setDrag({ id: o.id, patch: () => ({ position: { x, n }, rotation }) })
  }
  const onDragEnd = () => {
    const t = live.current
    live.current = null
    setDrag(null)
    if (t) transformObject(o.id, { position: { x: t.x, n: t.n }, rotation: t.rotation })
  }

  return (
    <PivotControls
      matrix={matrix}
      autoTransform={false}
      activeAxes={[true, false, true]}
      disableAxes
      disableScaling
      fixed
      scale={110}
      lineWidth={3}
      depthTest={false}
      offset={[0, 0.3, 0]}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
    />
  )
}
