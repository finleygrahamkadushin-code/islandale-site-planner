/**
 * The window listeners of one live pointer drag, ended in one place
 * however the drag stops: a release, a cancelled pointer (a touch taken
 * by the browser, a system dialog), lost pointer capture, the window
 * losing focus, Escape, or the caller going away. Every listener comes
 * off together, so no drag can leave orbit off or keys swallowed.
 * Pure DOM events: the caller decides what a cancel or a release means.
 */

export interface DragSessionOptions {
  /** The pointer that started the drag; other pointers' events are not this drag's. */
  readonly pointerId: number
  /** Every key stops at the drag while it is live (Delete or Undo could pull the object out from under it). */
  readonly holdKeys?: boolean
  /** Follow the pointer's moves (for a drag not followed by its own element). */
  readonly onMove?: (e: PointerEvent) => void
  /** Follow the release, which ends the session (otherwise the caller's own handler ends it with stop). */
  readonly onUp?: (e: PointerEvent) => void
  /** The drag was dropped: put everything back, commit nothing. Called at most once. */
  readonly onCancel: () => void
}

export interface DragSession {
  /** Take the listeners off without cancelling (the drag ended normally, or is being ended by the caller). */
  readonly stop: () => void
  /** Drop the drag from outside (unmount, Present mode): stop, then onCancel once. */
  readonly cancel: () => void
  readonly live: () => boolean
}

export function startDragSession(target: EventTarget, opts: DragSessionOptions): DragSession {
  let live = true
  // one signal takes every listener off at once; capture phase, so they run before the app's own window listeners
  const off = new AbortController()
  const on = (type: string, fn: (e: Event) => void) => target.addEventListener(type, fn, { capture: true, signal: off.signal })
  const stop = () => {
    if (!live) return
    live = false
    off.abort()
  }
  const cancel = () => {
    if (!live) return
    stop()
    opts.onCancel()
  }
  const mine = (e: Event) => (e as PointerEvent).pointerId === opts.pointerId

  on('pointercancel', (e) => mine(e) && cancel())
  on('lostpointercapture', (e) => mine(e) && cancel())
  // a capture-phase listener on the window also hears every element's blur: only the window's own counts
  on('blur', (e) => e.target === target && cancel())
  on('keydown', (e) => {
    if (opts.holdKeys) e.stopImmediatePropagation()
    if ((e as KeyboardEvent).key !== 'Escape') return
    e.preventDefault()
    e.stopImmediatePropagation()
    cancel()
  })
  const { onMove, onUp } = opts
  if (onMove) on('pointermove', (e) => mine(e) && onMove(e as PointerEvent))
  if (onUp)
    on('pointerup', (e) => {
      if (!mine(e)) return
      stop()
      onUp(e as PointerEvent)
    })

  return { stop, cancel, live: () => live }
}
