import type { ThreeEvent } from '@react-three/fiber'
import { useCallback } from 'react'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { massOf } from './partFrame'

/** A click that moved this far was a drag or an orbit, not a pick (legacy wing-select). */
const PICK_SLOP_PX = 4

/**
 * Click to select, shift-click to add or remove, hover highlight. A
 * second click on the selected building (or an Alt+click) picks the part
 * under the pointer, main walls included.
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
      if (e.shiftKey) return toggleSelect(o.id)
      const s = usePlanStore.getState()
      const already = s.selection.length === 1 && s.selection[0] === o.id
      const mass = o.type === 'house' ? massOf(e.object) : undefined
      if (mass !== undefined && (already || e.altKey)) {
        if (e.delta < PICK_SLOP_PX) s.pickPart({ objectId: o.id, mass })
        return
      }
      select([o.id])
    },
    [o.id, o.type, select, toggleSelect],
  )
  const onPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      setHovered(o.id)
      document.body.style.cursor = 'pointer'
    },
    [o.id, setHovered],
  )
  const onPointerOut = useCallback(() => {
    setHovered(null)
    document.body.style.cursor = ''
  }, [setHovered])

  return { selected, hovered, handlers: { onClick, onPointerOver, onPointerOut } }
}
