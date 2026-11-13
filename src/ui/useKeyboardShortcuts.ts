import { useEffect } from 'react'
import { redoPlan, undoPlan, usePlanStore } from '../store/planStore'
import { partKey, TURN_KEYS } from '../buildings/parts/partKeys'
import { toolKey } from '../tools/toolKeys'
import { viewKey } from '../layout/viewKeys'
import { useOverlay } from '../layout/Overlays'
import { useInteriorView } from '../interiors/editor/interiorView'
import { deleteSubject, requestDelete } from '../guide/confirm'
import { useGuideMode } from '../guide/mode'
import { arrowStep } from '../tools/arrowSteps'
import { announce, positionWords } from './announce'
import { isPresenting, usePresent } from '../present/present'
import { useConfirm } from '../guide/confirm'
import { useIsolate } from '../tools/isolate'
import { keepsKey, keyTargetOf } from './keyOwner'
import { singleKeyOff } from './singleKeys'

/** A layer that covers the plan without holding focus inside it (the old planner's overlay). */
const MODAL_SELECTOR = '[aria-modal="true"]'

/** Undo/redo, duplicate, group (Cmd+G, Shift ungroups), the tool keys (toolKeys), delete, escape, Q / E / R turns and arrow-key nudges for the selection; a picked part takes its keys first (partKeys). */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // a control that already acted on the key (a tab or radio moving on) keeps it. Not Escape: a tooltip closing
      // on it marks it handled too, and must not cost the plan its Escape; a layer that owns Escape stops it itself
      if (e.defaultPrevented && e.key !== 'Escape') return
      // so does a text field, a slider or tab under its arrow keys, and anything inside a dialog or menu (keyOwner)
      if (keepsKey(keyTargetOf(e.target), e.key)) return
      // single-character shortcuts turned off (R10.5): arrows, Escape, Delete and the Ctrl / Cmd chords still work
      if (singleKeyOff(e)) return
      if (document.querySelector(MODAL_SELECTOR)) return
      // Present mode (4D): no editing keys; Escape leaves
      if (isPresenting()) {
        if (e.key === 'Escape') usePresent.getState().leave()
        return
      }
      const s = usePlanStore.getState()
      const mod = e.metaKey || e.ctrlKey
      // Cmd/Ctrl+K: command search; ? : the shortcuts sheet; while either is open it takes the keys (4B)
      const overlay = useOverlay.getState()
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        overlay.setOpen(overlay.open === 'commands' ? null : 'commands')
        return
      }
      // an open overlay or delete question takes every other key, undo and redo included
      if (overlay.open || useConfirm.getState().ask) return
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redoPlan()
        else undoPlan()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redoPlan()
        return
      }
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
        announceTurn(s.selection, s.plan)
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
        // Advanced deletes at once, so say so (R10.1); Beginner's question speaks for itself
        const subject = deleteSubject(s.selection)
        requestDelete(s.selection)
        if (useGuideMode.getState().mode === 'advanced') announce(`Deleted ${subject}`)
        return
      }
      // the arrows follow the compass (up is north), as they move the ghost while placing (arrowSteps)
      const delta = arrowStep(e)
      if (delta) {
        e.preventDefault()
        s.nudgeObjects(s.selection, delta[0], delta[1])
        announceMove(s.selection, s.plan)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Where a nudge left the selection (R10.1); nothing when nothing moved (a locked object says why in the toast). */
function announceMove(ids: readonly string[], before: ReturnType<typeof usePlanStore.getState>['plan']): void {
  const plan = usePlanStore.getState().plan
  if (plan === before) return
  const moved = ids.filter((id) => plan.objects[id] && plan.objects[id] !== before.objects[id])
  if (moved.length === 1) announce(`${plan.objects[moved[0]].name} at ${positionWords(plan.objects[moved[0]].position)}`)
  else if (moved.length > 1) announce(`${moved.length} objects moved; ${plan.objects[moved[0]].name} at ${positionWords(plan.objects[moved[0]].position)}`)
}

/** Which way a Q / E / R turn left the selection (R10.1); nothing when nothing turned. */
function announceTurn(ids: readonly string[], before: ReturnType<typeof usePlanStore.getState>['plan']): void {
  const plan = usePlanStore.getState().plan
  const o = plan.objects[ids[0]]
  if (!o || plan === before) return
  announce(ids.length === 1 ? `${o.name} turned to ${Math.round(o.rotation)}°` : `${ids.length} objects turned; ${o.name} at ${Math.round(o.rotation)}°`)
}
