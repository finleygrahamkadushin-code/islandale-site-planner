import { useEffect } from 'react'
import { usePlanStore } from '../store/planStore'
import { ftToM } from '../site/units'
import { partKey, TURN_KEYS } from '../buildings/parts/partKeys'
import { toolKey } from '../tools/toolKeys'
import { viewKey } from '../layout/viewKeys'
import { useOverlay } from '../layout/Overlays'
import { useInteriorView } from '../interiors/editor/interiorView'
import { requestDelete } from '../guide/confirm'
import { isPresenting, usePresent } from '../present/present'
import { useConfirm } from '../guide/confirm'
import { useIsolate } from '../tools/isolate'

const NUDGE_FT = 1
const NUDGE_SHIFT_FT = 5

const TEXT_INPUT_TYPES = new Set(['text', 'number', 'search', 'email', 'url', 'password', 'tel'])

/** True when the key press belongs to a text field, not to the plan. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type)
}

/** Undo/redo, duplicate, group (Cmd+G, Shift ungroups), the tool keys (toolKeys), delete, escape, Q / E / R turns and arrow-key nudges for the selection; a picked part takes its keys first (partKeys). */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      // Present mode (4D): no editing keys; Escape leaves
      if (isPresenting()) {
        if (e.key === 'Escape') usePresent.getState().leave()
        return
      }
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
      // Cmd/Ctrl+K: command search; ? : the shortcuts sheet; while either is open it takes the keys (4B)
      const overlay = useOverlay.getState()
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        overlay.setOpen(overlay.open === 'commands' ? null : 'commands')
        return
      }
      if (overlay.open || useConfirm.getState().ask) return
      if (!mod && e.key === '?') {
        e.preventDefault()
        overlay.setOpen('help')
        return
      }
      // the interior editor takes every other key while it is open
      if (useInteriorView.getState().objectId) return
      // Cmd/Ctrl+D duplicates the selection (and keeps the browser from bookmarking)
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (s.selection.length) s.duplicateObjects(s.selection)
        return
      }
      // Cmd/Ctrl+G groups the selection, with Shift ungroups it (and keeps the browser's find-next away)
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (!s.selection.length) return
        if (e.shiftKey) s.ungroupObjects(s.selection)
        else s.groupObjects(s.selection)
        return
      }
      if (!mod && viewKey(e, s)) {
        e.preventDefault()
        return
      }
      if (!mod && toolKey(e, s)) {
        e.preventDefault()
        return
      }
      if (!mod && partKey(e, usePlanStore.getState)) {
        e.preventDefault()
        return
      }
      // Q / E turn the selection 5°, R a quarter turn (the picked wing took them first, above)
      const turn = TURN_KEYS[e.key.toLowerCase()]
      if (!mod && turn !== undefined && s.selection.length) {
        e.preventDefault()
        s.turnObjects(s.selection, e.key === 'R' && e.shiftKey ? -turn : turn)
        return
      }
      if (e.key === 'Escape') {
        // isolate mode: Escape leaves it first, keeping the selection
        const isolate = useIsolate.getState()
        if (isolate.isolation) isolate.leave()
        else s.select([])
        return
      }
      if (!s.selection.length) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        requestDelete(s.selection)
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
