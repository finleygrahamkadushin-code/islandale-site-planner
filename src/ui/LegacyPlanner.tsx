import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { focusedElement, returnFocusTo } from './returnFocus'

interface Props {
  readonly onClose: () => void
}

/**
 * The old planner, shown over the new one. In the hosted home only the main page gets the claude.ai
 * runtime; opened in this frame, the old planner's ext:hosted-home block borrows it from this page,
 * so its layout saves to the same database.
 *
 * A Radix Dialog (R10.6): focus starts on "Back to the new planner", Tab stays inside the overlay and
 * its frame, Escape (outside the frame, which keeps its own keys) closes it, and focus goes back to
 * what opened it. `aria-modal` also keeps the plan's shortcuts off while the frame holds focus.
 */
export function LegacyPlanner({ onClose }: Props) {
  // read during the first render, before the dialog moves focus into itself
  const [opener] = useState(focusedElement)
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Content className="legacy-planner" aria-modal="true" aria-describedby={undefined} onCloseAutoFocus={returnFocusTo(() => opener)} data-testid="legacy-planner">
          <div className="legacy-bar">
            <Dialog.Title asChild>
              <strong>Old planner</strong>
            </Dialog.Title>
            <span className="muted small">Its layout saves to the hosted home too</span>
            <Dialog.Close asChild>
              <button type="button" data-testid="legacy-close">
                Back to the new planner
              </button>
            </Dialog.Close>
          </div>
          <iframe src="./legacy.html" title="The old planner" />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
