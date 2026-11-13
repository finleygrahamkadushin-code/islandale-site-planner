import { useCallback, useEffect, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three'
import { create } from 'zustand'
import { usePlanStore } from '../store/planStore'
import { isObjectVisible } from '../store/selectors'
import { toolOf } from '../store/toolActions'
import { useEarthworks } from '../site/earthworks/useEarthworks'
import { toScene } from '../scene/frame'
import { idsInBox } from './arrange'
import { pickedIds } from './groups'
import { isOutside, isolationNow } from './isolate'
import { startDragSession, type DragSession } from './dragSession'
import { addsToSelection, afterBox, useAddMode } from './addMode'

/**
 * Box select (4B): with the Select tool, Shift-drag on empty ground draws a
 * north-up box and selects every visible object whose centre is inside.
 * With Add to selection on (R10.2, no modifier key) a plain drag draws the
 * box and it adds to the selection instead.
 * The drag is followed with window listeners (pointer on a level plane at
 * the press point), so it does not depend on which mesh the pointer is
 * over; the click that ends it is not a "click on nothing". View state.
 * A cancelled pointer, lost capture, Escape or the ground going away
 * drops the box and selects nothing.
 */

type Pos = { x: number; n: number }

export const useSelectBox = create<{ readonly a: Pos | null; readonly b: Pos | null; readonly set: (a: Pos | null, b: Pos | null) => void }>((set) => ({
  a: null,
  b: null,
  set: (a, b) => set({ a, b }),
}))

/** A box drag ended this recently, ms: the click that follows it must not clear the new selection. */
const AFTER_BOX_MS = 300
let boxEndedAt = 0
export const boxJustEnded = (): boolean => performance.now() - boxEndedAt < AFTER_BOX_MS

/** Where a screen point meets the level plane at height y (scene metres), as a site point. */
function onPlane(clientX: number, clientY: number, camera: Camera, dom: HTMLElement, y: number): Pos | null {
  const r = dom.getBoundingClientRect()
  const ray = new Raycaster()
  ray.setFromCamera(new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera)
  const hit = new Vector3()
  return ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -y), hit) ? { x: hit.x, n: -hit.z } : null
}

/** The ground's Shift-press handler that starts a box. */
export function useBoxSelect() {
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const camera = useThree((s) => s.camera)
  const dom = useThree((s) => s.gl.domElement)
  const session = useRef<DragSession | null>(null)
  // the ground going away mid-box drops the box, so orbit is never left off
  useEffect(() => () => session.current?.cancel(), [])
  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const s = usePlanStore.getState()
      if (e.button !== 0 || !addsToSelection(e) || toolOf(s) !== 'select') return
      // a press on an object reaches the ground behind it too: that is a Shift-click on the object, not a box
      if (e.intersections[0] && e.intersections[0].eventObject !== e.eventObject) return
      const add = useAddMode.getState().on
      e.stopPropagation()
      session.current?.cancel()
      if (controls) controls.enabled = false
      const y = e.point.y
      const a = { x: e.point.x, n: -e.point.z }
      useSelectBox.getState().set(a, a)
      /** Put the view back as it was, whether the box was finished or dropped. */
      const close = () => {
        session.current = null
        if (controls) controls.enabled = true
        useSelectBox.getState().set(null, null)
        boxEndedAt = performance.now()
      }
      const up = (ev: PointerEvent) => {
        const b = onPlane(ev.clientX, ev.clientY, camera, dom, y) ?? useSelectBox.getState().b ?? a
        close()
        const st = usePlanStore.getState()
        // isolate mode: only what is isolated can be boxed; a box takes whole groups except in the open one
        const iso = isolationNow()
        const shown = st.plan.order.map((id) => st.plan.objects[id]).filter((o) => o && isObjectVisible(st, o.id) && !isOutside(iso, o.id))
        st.select(afterBox(st.selection, pickedIds(st.plan, idsInBox(shown, a, b), iso?.group ?? null), add))
      }
      const pointerId = e.nativeEvent.pointerId
      session.current = startDragSession(window, {
        pointerId,
        onMove: (ev) => {
          const b = onPlane(ev.clientX, ev.clientY, camera, dom, y)
          if (b) useSelectBox.getState().set(a, b)
        },
        onUp: up,
        onCancel: close,
      })
      // the canvas keeps the pointer, so a release outside the window still ends the box
      try {
        dom.setPointerCapture(pointerId)
      } catch {
        // a pointer that is already gone: its cancel or release reaches the session anyway
      }
    },
    [controls, camera, dom],
  )
  return { onPointerDown }
}

/** The box being dragged, drawn on the ground. */
export function BoxSelectLayer() {
  const a = useSelectBox((s) => s.a)
  const b = useSelectBox((s) => s.b)
  const { ground } = useEarthworks()
  if (!a || !b) return null
  const corner = (x: number, n: number) => toScene(x, n, ground(x, n) + 0.1)
  const pts = [corner(a.x, a.n), corner(b.x, a.n), corner(b.x, b.n), corner(a.x, b.n), corner(a.x, a.n)]
  return <Line points={pts} color="#5fb3e6" lineWidth={2} dashed dashSize={0.5} gapSize={0.3} depthTest={false} />
}
