import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Plane, Vector3 } from 'three'
import { isObjectLocked, pickedPartOf, usePlanStore } from '../store/planStore'
import { toolOf } from '../store/toolActions'
import type { PlanObject } from '../store/types'
import { useLiveDrag } from '../scene/editing'
import { snapPoint } from './snap'

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
 * Esc drops the drag. Locked objects and bridges (moved by their gizmo
 * route) do not drag.
 */
export function useDragMove(o: PlanObject) {
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const live = useRef<Live | null>(null)
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), [])
  const hit = useMemo(() => new Vector3(), [])

  // one stable key listener for the life of the hook, calling the latest handler
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  const onKey = useMemo(() => (e: KeyboardEvent) => keyHandler.current(e), [])
  const end = useCallback(
    (commit: boolean) => {
      const l = live.current
      live.current = null
      if (controls) controls.enabled = true
      window.removeEventListener('keydown', onKey, true)
      useLiveDrag.getState().setDrag(null)
      if (!commit || !l?.at) return
      const s = usePlanStore.getState()
      if (l.group) s.nudgeObjects(l.group, l.at.x - l.x0, l.at.n - l.n0)
      else s.transformObject(o.id, { position: l.at })
    },
    [controls, o.id, onKey],
  )
  // while a drag is live every key stops here first (Delete or Undo could pull the object out from under it); Esc drops it
  keyHandler.current = (e: KeyboardEvent) => {
    if (!live.current) return
    e.stopImmediatePropagation()
    if (e.key !== 'Escape') return
    e.preventDefault()
    end(false)
  }
  useEffect(
    () => () => {
      if (live.current) end(false)
    },
    [end],
  )

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
      window.addEventListener('keydown', onKey, true)
    },
    [o, controls, plane, onKey],
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
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
      end(true)
    },
    [end],
  )

  return { onPointerDown, onPointerMove, onPointerUp, isDragging: () => live.current?.at != null }
}
