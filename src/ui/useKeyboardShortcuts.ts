import { useEffect } from 'react'
import { usePlanStore } from '../store/planStore'
import { ftToM } from '../site/units'
import { partKey } from '../buildings/parts/partKeys'
import { useInteriorView } from '../interiors/editor/interiorView'

const NUDGE_FT = 1
const NUDGE_SHIFT_FT = 5

const TEXT_INPUT_TYPES = new Set(['text', 'number', 'search', 'email', 'url', 'password', 'tel'])

/** True when the key press belongs to a text field, not to the plan. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type)
}

/** Undo/redo, delete, escape and arrow-key nudges for the selection; a picked part takes its keys first (partKeys). */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const s = usePlanStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) usePlanStore.temporal.getState().redo()
        else usePlanStore.temporal.getState().undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        usePlanStore.temporal.getState().redo()
        return
      }
      // the interior editor takes every other key while it is open
      if (useInteriorView.getState().objectId) return
      // placing a path piece: R turns it a quarter, Escape stops
      if (s.placing && !mod) {
        if (e.key === 'Escape') {
          e.preventDefault()
          s.setPlacing(null)
          return
        }
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault()
          s.setPlacing({ ...s.placing, rotation: (s.placing.rotation + (e.shiftKey ? 270 : 90)) % 360 })
          return
        }
      }
      // Paint mode: P toggles it, Escape leaves it
      if (!mod && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        s.setPainting(!s.painting)
        return
      }
      if (s.painting && e.key === 'Escape') {
        e.preventDefault()
        s.setPainting(false)
        return
      }
      // the Connect tool: C toggles it, Escape leaves it
      if (!mod && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        s.setConnecting(s.connecting ? null : { A: null, B: null, widthFt: 4 })
        return
      }
      if (s.connecting && e.key === 'Escape') {
        e.preventDefault()
        s.setConnecting(null)
        return
      }
      if (!mod && partKey(e, usePlanStore.getState)) {
        e.preventDefault()
        return
      }
      if (e.key === 'Escape') {
        s.select([])
        return
      }
      if (!s.selection.length) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        s.deleteObjects(s.selection)
        return
      }
      const step = ftToM(e.shiftKey ? NUDGE_SHIFT_FT : NUDGE_FT)
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      }
      const delta = nudge[e.key]
      if (delta) {
        e.preventDefault()
        s.nudgeObjects(s.selection, delta[0], delta[1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
