import type { ThreeEvent } from '@react-three/fiber'
import { useCallback } from 'react'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { massOf } from './partFrame'
import { firstPaintHit, isPaintable } from './paintHit'
import { usePaintHover } from './paintHover'

/** A click that moved this far was a drag or an orbit, not a pick (legacy wing-select). */
const PICK_SLOP_PX = 4

/**
 * Click to select, shift-click to add or remove, hover highlight. A
 * second click on the selected building (or an Alt+click) picks the part
 * under the pointer, main walls included. In Paint mode a click picks the
 * element (wall, roof, rail…) the Exterior panel paints instead.
 */
export function useObjectInteraction(o: PlanObject) {
  const select = usePlanStore((s) => s.select)
  const toggleSelect = usePlanStore((s) => s.toggleSelect)
  const setHovered = usePlanStore((s) => s.setHovered)
  const selected = usePlanStore((s) => s.selection.includes(o.id))
  const hovered = usePlanStore((s) => s.hovered === o.id)

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      const s = usePlanStore.getState()
      if (s.painting) {
        if (e.delta >= PICK_SLOP_PX) return
        if (!isPaintable(o)) return s.showToast('Paint works on buildings and decks')
        const hit = firstPaintHit(o, e.intersections)
        if (!hit) return s.showToast('That part has no exterior finish')
        if (s.selection.length !== 1 || s.selection[0] !== o.id) select([o.id])
        s.setPaintFocus(hit.focus)
        return
      }
      if (e.shiftKey) return toggleSelect(o.id)
      const already = s.selection.length === 1 && s.selection[0] === o.id
      const mass = o.type === 'house' ? massOf(e.object) : undefined
      if (mass !== undefined && (already || e.altKey)) {
        if (e.delta < PICK_SLOP_PX) s.pickPart({ objectId: o.id, mass })
        return
      }
      select([o.id])
    },
    [o, select, toggleSelect],
  )
  const onPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      setHovered(o.id)
      document.body.style.cursor = usePlanStore.getState().painting ? 'cell' : 'pointer'
    },
    [o.id, setHovered],
  )
  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!usePlanStore.getState().painting) return
      e.stopPropagation()
      const hit = isPaintable(o) ? firstPaintHit(o, e.intersections) : null
      usePaintHover.getState().setLabel(hit ? hit.label : null)
    },
    [o],
  )
  const onPointerOut = useCallback(() => {
    setHovered(null)
    usePaintHover.getState().setLabel(null)
    document.body.style.cursor = ''
  }, [setHovered])

  return { selected, hovered, handlers: { onClick, onPointerOver, onPointerMove, onPointerOut } }
}
