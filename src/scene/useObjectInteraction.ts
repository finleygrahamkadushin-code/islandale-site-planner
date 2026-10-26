import type { ThreeEvent } from '@react-three/fiber'
import { useCallback } from 'react'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'

/** Click to select, shift-click to add or remove, hover highlight. */
export function useObjectInteraction(o: PlanObject) {
  const select = usePlanStore((s) => s.select)
  const toggleSelect = usePlanStore((s) => s.toggleSelect)
  const setHovered = usePlanStore((s) => s.setHovered)
  const selected = usePlanStore((s) => s.selection.includes(o.id))
  const hovered = usePlanStore((s) => s.hovered === o.id)

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (e.shiftKey) toggleSelect(o.id)
      else select([o.id])
    },
    [o.id, select, toggleSelect],
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
