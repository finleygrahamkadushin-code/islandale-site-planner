import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePlanStore } from '../store/planStore'
import { toastDuration, toastKind } from './toastTiming'

/**
 * The app's one message line. The live region stays mounted and only its
 * text changes, so screen readers hear each toast. A problem with the
 * plan or its save stays until dismissed; a refused edit and news fade on
 * their own, held while the pointer or focus is on the toast. Every toast
 * can be closed. It lives on <body>, outside the app root, because the
 * drawing sheets make the root inert, which would hide it from screen
 * readers and stop its close button.
 */
export function Toast() {
  const toast = usePlanStore((s) => s.toast)
  const [closedId, setClosedId] = useState<number | null>(null)
  // held per toast, so a new toast is never held by a pointer or focus that left without telling
  const [heldId, setHeldId] = useState<number | null>(null)
  const open = toast !== null && toast.id !== closedId
  const held = open && toast.id === heldId
  const ms = toast ? toastDuration(toast.text) : null

  useEffect(() => {
    if (!open || held || ms === null || !toast) return
    const t = setTimeout(() => setClosedId(toast.id), ms)
    return () => clearTimeout(t)
  }, [open, held, ms, toast])

  const kind = toast ? toastKind(toast.text) : 'info'
  return createPortal(
    <div
      className="toast"
      data-open={open}
      data-kind={kind}
      onPointerEnter={() => setHeldId(toast?.id ?? null)}
      onPointerLeave={() => setHeldId(null)}
      onFocus={() => setHeldId(toast?.id ?? null)}
      onBlur={() => setHeldId(null)}
    >
      <div className="toast-text" role="status" aria-live="polite" aria-atomic="true">
        {open ? toast.text : ''}
      </div>
      {open && (
        <button type="button" className="toast-close" aria-label="Dismiss message" onClick={() => toast && setClosedId(toast.id)}>
          ×
        </button>
      )}
    </div>,
    document.body,
  )
}
