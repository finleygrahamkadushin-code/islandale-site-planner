import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Plane, Vector3 } from 'three'
import { isObjectLocked, pickedPartOf, usePlanStore } from '../store/planStore'
import { toolOf } from '../store/toolActions'
import type { PlanObject } from '../store/types'
import { useLiveDrag } from '../scene/editing'
import { snapPoint } from './snap'
import { startDragSession, type DragSession } from './dragSession'

/** Nothing moves until the pointer has gone this far, so a click stays a click (legacy). */
const DRAG_SLOP_PX = 4

interface Live {
  /** A group drag: the selection's unlocked objects, all moved by the same offset. */
  readonly group: readonly string[] | null
  readonly x0: number
  readonly n0: number
  readonly hitX: number
  readonly hitZ: number
  readonly px: number
  readonly py: number
  at: { x: number; n: number } | null
}

/**
 * Drag a selected object across the ground to move it (old Select tool),
 * with the Select tool on and nothing of it picked. The object follows the
 * pointer live (snapped to the 1 ft grid when Snap is on; Shift drags
 * freely), and the move is committed once on release as one undo step.
 * Esc, a cancelled pointer, lost capture, the window losing focus or the
 * object going away drops the drag with no undo step. Locked objects and
 * bridges (moved by their gizmo route) do not drag.
 */
export function useDragMove(o: PlanObject) {
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const live = useRef<Live | null>(null)
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), [])
  const hit = useMemo(() => new Vector3(), [])

  // the live drag's window listeners: while it is live every key stops there first (Delete or Undo could pull the object out from under it)
  const session = useRef<DragSession | null>(null)
  const end = useCallback(
    (commit: boolean) => {
      const l = live.current
      live.current = null
      session.current?.stop()
      session.current = null
      if (controls) controls.enabled = true
      useLiveDrag.getState().setDrag(null)
      if (!commit || !l?.at) return
      const s = usePlanStore.getState()
      if (l.group) s.nudgeObjects(l.group, l.at.x - l.x0, l.at.n - l.n0)
      else s.transformObject(o.id, { position: l.at })
    },
    [controls, o.id],
  )
  /** Drop a live drag without a step (Present mode starting, the object going away). */
  const cancel = useCallback(() => {
    if (live.current) end(false)
  }, [end])
  useEffect(() => cancel, [cancel])

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return
      const s = usePlanStore.getState()
      // the dragged object must be selected; with several selected, the whole unlocked selection moves (4B)
      if (!s.selection.includes(o.id) || toolOf(s) !== 'select' || isObjectLocked(s, o.id) || pickedPartOf(s)?.objectId === o.id) return
      const group = s.selection.length > 1 ? s.selection.filter((id) => !isObjectLocked(s, id)) : null
      if (!group && o.type === 'bridge') return
      plane.constant = -e.point.y
      ;(e.target as Element).setPointerCapture(e.pointerId)
      if (controls) controls.enabled = false
      live.current = { group, x0: o.position.x, n0: o.position.n, hitX: e.point.x, hitZ: e.point.z, px: e.nativeEvent.clientX, py: e.nativeEvent.clientY, at: null }
      session.current?.stop()
      session.current = startDragSession(window, { pointerId: e.pointerId, holdKeys: true, onCancel: () => end(false) })
    },
    [o, controls, plane, end],
  )

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>): boolean => {
      const l = live.current
      if (!l) return false
      e.stopPropagation()
      if (!l.at && Math.hypot(e.nativeEvent.clientX - l.px, e.nativeEvent.clientY - l.py) < DRAG_SLOP_PX) return true
      if (!e.ray.intersectPlane(plane, hit)) return true
      const free = { x: l.x0 + (hit.x - l.hitX), n: l.n0 - (hit.z - l.hitZ) }
      const at = usePlanStore.getState().snap && !e.shiftKey ? snapPoint(free) : free
      l.at = at
      const dx = at.x - l.x0
      const dn = at.n - l.n0
      useLiveDrag.getState().setDrag({ id: o.id, group: l.group ?? undefined, patch: (p) => ({ position: { x: p.position.x + dx, n: p.position.n + dn } }) })
      return true
    },
    [o.id, plane, hit],
  )

  const onPointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!live.current) return
      e.stopPropagation()
      // commit first: releasing capture fires lostpointercapture, which would otherwise drop the drag
      end(true)
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    },
    [end],
  )

  return { onPointerDown, onPointerMove, onPointerUp, cancel, isDragging: () => live.current?.at != null }
}
