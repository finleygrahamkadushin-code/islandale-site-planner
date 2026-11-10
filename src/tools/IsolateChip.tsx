import { useEffect } from 'react'
import { usePlanStore } from '../store/planStore'
import { usePresent } from '../present/present'
import { isolationAlive, useIsolate } from './isolate'

/**
 * The chip over the view while something is isolated: what is being edited,
 * Fade or Hide for the rest, and Done. It also ends isolation when Present
 * mode starts or when undo, delete or a scheme load takes away what was isolated.
 */
export function IsolateChip() {
  const isolation = useIsolate((s) => s.isolation)
  const hideRest = useIsolate((s) => s.hideRest)
  const setHideRest = useIsolate((s) => s.setHideRest)
  const leave = useIsolate((s) => s.leave)
  const plan = usePlanStore((s) => s.plan)
  const presenting = usePresent((s) => s.presenting)

  useEffect(() => {
    if (isolation && (presenting || !isolationAlive(isolation, plan))) leave()
  }, [isolation, plan, presenting, leave])

  if (!isolation || presenting) return null
  return (
    <div className="isolate-chip" data-testid="isolate-chip" role="group" aria-label="Editing alone">
      <span className="isolate-name" aria-live="polite">
        Editing: <strong>{isolation.name}</strong>
        {isolation.group ? ' · click a member to edit it' : ''} · Esc leaves
      </span>
      <span className="isolate-toggle" role="group" aria-label="The rest of the plan">
        <button type="button" aria-pressed={!hideRest} onClick={() => setHideRest(false)} data-testid="isolate-fade">
          Fade rest
        </button>
        <button type="button" aria-pressed={hideRest} onClick={() => setHideRest(true)} data-testid="isolate-hide">
          Hide rest
        </button>
      </span>
      <button type="button" className="isolate-done" onClick={leave} data-testid="isolate-done">
        Done
      </button>
    </div>
  )
}
