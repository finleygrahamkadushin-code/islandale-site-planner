import * as Dialog from '@radix-ui/react-dialog'
import { useConfirm } from './confirm'

/** The one confirm dialog (4C): Cancel has focus first, Escape and a click outside cancel. */
export function ConfirmDialog() {
  const ask = useConfirm((s) => s.ask)
  const answer = useConfirm((s) => s.answer)
  return (
    <Dialog.Root open={ask !== null} onOpenChange={(on) => !on && answer(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog confirm-dialog" data-testid="confirm-dialog">
          <Dialog.Title className="dialog-title">{ask?.title}</Dialog.Title>
          <Dialog.Description className="confirm-body">{ask?.body}</Dialog.Description>
          <div className="confirm-actions">
            <button type="button" autoFocus onClick={() => answer(false)} data-testid="confirm-cancel">
              Cancel
            </button>
            <button type="button" className="danger" onClick={() => answer(true)} data-testid="confirm-yes">
              {ask?.confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
