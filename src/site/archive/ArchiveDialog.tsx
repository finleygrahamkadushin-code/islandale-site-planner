import { lazy, Suspense } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { loadArchive } from '../../app/prefetch'
import { useArchiveOpen } from './archiveOpen'

// the cards and their summaries load the first time the archive opens (as command search does)
const ArchiveBrowser = lazy(() => loadArchive().then((m) => ({ default: m.ArchiveBrowser })))

/** The Designs archive (5F): every scheme as a card, in a Radix Dialog. Escape or a click outside closes it. */
export function ArchiveDialog() {
  const open = useArchiveOpen((s) => s.open)
  const setOpen = useArchiveOpen((s) => s.setOpen)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog archive-dialog"
          data-testid="archive"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            // back to whatever opened it (Designs…, or where command search was opened from)
            const to = useArchiveOpen.getState().opener
            if (to?.isConnected) {
              e.preventDefault()
              to.focus()
            }
          }}
        >
          <Dialog.Title className="dialog-title">Designs</Dialog.Title>
          <Suspense fallback={<p className="muted small archive-loading">Reading the schemes…</p>}>
            <ArchiveBrowser />
          </Suspense>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
