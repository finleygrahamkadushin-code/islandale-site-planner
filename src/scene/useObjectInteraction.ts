import type { ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect } from 'react'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { massOf } from '../buildings/parts/partFrame'
import { railHit } from './railHit'
import { firstPaintHit, isPaintable } from '../buildings/paint/paintHit'
import { usePaintHover } from '../buildings/paint/paintHover'
import { usePresent } from '../present/present'
import { useDragMove } from '../tools/useDragMove'
import { pickedIds } from '../tools/groups'
import { isolationNow } from '../tools/isolate'
import { addsToSelection } from '../tools/addMode'

/** A click that moved this far was a drag or an orbit, not a pick (legacy wing-select). */
const PICK_SLOP_PX = 4

/**
 * Click to select, shift-click (or any click with Add to selection on, R10.2)
 * to add or remove, hover highlight. A
 * second click on the selected building (or an Alt+click) picks the part
 * under the pointer, main walls included. In Paint mode a click picks the
 * element (wall, roof, rail…) the Exterior panel paints instead. With the
 * Select tool, dragging the selected object moves it (useDragMove).
 */
const ignore = (): void => undefined
/**
 * Clicks already handled. While a press on a selected object holds pointer capture (useDragMove), R3F hands
 * the release's click to the captured object as well as to the hit, so one click would toggle twice.
 */
const handledClicks = new WeakSet<Event>()
/** Present mode (4D): objects take no clicks, hovers or drags. */
const PRESENT_HANDLERS = { onClick: ignore, onPointerOver: ignore, onPointerMove: ignore, onPointerOut: ignore, onPointerDown: ignore, onPointerUp: ignore }

export function useObjectInteraction(o: PlanObject) {
  const dragMove = useDragMove(o)
  const select = usePlanStore((s) => s.select)
  const toggleSelect = usePlanStore((s) => s.toggleSelect)
  const setHovered = usePlanStore((s) => s.setHovered)
  const selected = usePlanStore((s) => s.selection.includes(o.id))
  const hovered = usePlanStore((s) => s.hovered === o.id)
  const presenting = usePresent((s) => s.presenting)
  // Present mode swaps in handlers that ignore the release, so a drag still live when it starts is dropped here
  const cancelDrag = dragMove.cancel
  useEffect(() => {
    if (presenting) cancelDrag()
  }, [presenting, cancelDrag])

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (handledClicks.has(e.nativeEvent)) return
      handledClicks.add(e.nativeEvent)
      const s = usePlanStore.getState()
      // the Measure tool picks the point on the object, whatever it is
      if (s.measuring) {
        if (e.delta < PICK_SLOP_PX) s.measurePoint({ x: e.point.x, n: -e.point.z, z: e.point.y })
        return
      }
      if (s.painting) {
        if (e.delta >= PICK_SLOP_PX) return
        if (!isPaintable(o)) return s.showToast('Paint works on buildings and decks')
        const hit = firstPaintHit(o, e.intersections)
        if (!hit) return s.showToast('That part has no exterior finish')
        if (s.selection.length !== 1 || s.selection[0] !== o.id) select([o.id])
        s.setPaintFocus(hit.focus)
        return
      }
      if (addsToSelection(e)) return toggleSelect(o.id)
      const already = s.selection.length === 1 && s.selection[0] === o.id
      const mass = o.type === 'house' ? massOf(e.object) : undefined
      if (mass !== undefined && (already || e.altKey)) {
        if (e.delta < PICK_SLOP_PX) s.pickPart({ objectId: o.id, mass, rail: railHit(o, mass, e) })
        return
      }
      // a click picks the whole group, except inside the group open in isolation
      const ids = pickedIds(s.plan, [o.id], isolationNow()?.group ?? null)
      // clicking a member of the group already selected keeps the group (so it can be dragged)
      if (ids.length > 1 && ids.length === s.selection.length && ids.every((id) => s.selection.includes(id))) return
      select(ids)
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
      if (dragMove.onPointerMove(e)) return
      if (!usePlanStore.getState().painting) return
      e.stopPropagation()
      const hit = isPaintable(o) ? firstPaintHit(o, e.intersections) : null
      usePaintHover.getState().setLabel(hit ? hit.label : null)
    },
    [o, dragMove.onPointerMove],
  )
  const onPointerOut = useCallback(() => {
    setHovered(null)
    usePaintHover.getState().setLabel(null)
    document.body.style.cursor = ''
  }, [setHovered])

  // Present mode (4D) shows the plan; nothing in it can be picked or dragged
  if (presenting) return { selected, hovered, handlers: PRESENT_HANDLERS }
  return {
    selected,
    hovered,
    handlers: { onClick, onPointerOver, onPointerMove, onPointerOut, onPointerDown: dragMove.onPointerDown, onPointerUp: dragMove.onPointerUp },
  }
}
