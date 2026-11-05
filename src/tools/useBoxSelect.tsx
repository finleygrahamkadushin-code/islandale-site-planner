import { useCallback } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { create } from 'zustand'
import { usePlanStore } from '../store/planStore'
import { isObjectVisible } from '../store/selectors'
import { toolOf } from '../store/toolActions'
import { useEarthworks } from '../site/earthworks/useEarthworks'
import { toScene } from '../scene/frame'
import { idsInBox } from './arrange'

/**
 * Box select (4B): with the Select tool, Shift-drag on empty ground draws a
 * north-up box and selects every visible object whose centre is inside.
 * The box is view state.
 */

type Pos = { x: number; n: number }

export const useSelectBox = create<{ readonly a: Pos | null; readonly b: Pos | null; readonly set: (a: Pos | null, b: Pos | null) => void }>((set) => ({
  a: null,
  b: null,
  set: (a, b) => set({ a, b }),
}))

/** Pointer handlers the ground adds for box select; onPointerMove says whether it took the event. */
export function useBoxSelect() {
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const s = usePlanStore.getState()
      if (e.button !== 0 || !e.shiftKey || toolOf(s) !== 'select') return
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      if (controls) controls.enabled = false
      const at = { x: e.point.x, n: -e.point.z }
      useSelectBox.getState().set(at, at)
    },
    [controls],
  )
  const onPointerMove = useCallback((e: ThreeEvent<PointerEvent>): boolean => {
    const box = useSelectBox.getState()
    if (!box.a) return false
    box.set(box.a, { x: e.point.x, n: -e.point.z })
    return true
  }, [])
  const onPointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const { a, b, set } = useSelectBox.getState()
      if (!a || !b) return
      e.stopPropagation()
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
      if (controls) controls.enabled = true
      set(null, null)
      const s = usePlanStore.getState()
      const shown = s.plan.order.map((id) => s.plan.objects[id]).filter((o) => o && isObjectVisible(s, o.id))
      s.select(idsInBox(shown, a, b))
    },
    [controls],
  )
  return { onPointerDown, onPointerMove, onPointerUp }
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
