import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  readonly onClose: () => void
}

/**
 * The old planner, shown over the new one. In the hosted home only the main page gets the claude.ai
 * runtime; opened in this frame, the old planner's ext:hosted-home block borrows it from this page,
 * so its layout saves to the same database.
 */
export function LegacyPlanner({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && e.target === document.body && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="legacy-planner" role="dialog" aria-modal="true" aria-label="The old planner">
      <div className="legacy-bar">
        <strong>Old planner</strong>
        <span className="muted small">Its layout saves to the hosted home too</span>
        <button onClick={onClose}>Back to the new planner</button>
      </div>
      <iframe src="./legacy.html" title="The old planner" />
    </div>,
    document.body,
  )
}
