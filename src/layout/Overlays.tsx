import { lazy, Suspense } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { create } from 'zustand'
import { SHORTCUT_GROUPS } from './shortcuts'
import { loadCommandMenu } from '../app/prefetch'
import { useTour } from '../guide/tour'
import { useSingleKeys } from '../ui/singleKeys'

/** Which overlay is open: command search (Cmd/Ctrl+K) or the Help sheet (?). View state. */
// command search (cmdk) loads the first time it opens (4E)
const CommandMenu = lazy(() => loadCommandMenu().then((m) => ({ default: m.CommandMenu })))

export const useOverlay = create<{ readonly open: 'commands' | 'help' | null; readonly setOpen: (o: 'commands' | 'help' | null) => void }>((set) => ({
  open: null,
  setOpen: (open) => set({ open }),
}))

function HelpSheet() {
  const singleKeys = useSingleKeys((s) => s.on)
  return (
    <div className="help-sheet" data-testid="help-sheet">
      {/* R10.5 (WCAG 2.1.4): one-letter shortcuts can be turned off, remembered per browser */}
      <label className="help-single-keys">
        <input type="checkbox" checked={singleKeys} onChange={(e) => useSingleKeys.getState().setOn(e.target.checked)} data-testid="single-keys" />
        <span>Single-key shortcuts (letters, numbers, ?). Off, only arrows, Escape, Delete and the {'Ctrl / ⌘'} shortcuts work.</span>
      </label>
      <div className="help-tour">
        <span>New here? A five-step tour shows how to look around, pick, move, lock and save.</span>
        <button
          type="button"
          data-testid="take-tour"
          onClick={() => {
            useOverlay.getState().setOpen(null)
            useTour.getState().start()
          }}
        >
          Take the tour
        </button>
      </div>
      {SHORTCUT_GROUPS.map((g) => (
        <section key={g.title}>
          <h3>{g.title}</h3>
          <dl>
            {g.items.map((it) => (
              <div key={it.keys} className="help-row">
                <dt>
                  <kbd>{it.keys}</kbd>
                </dt>
                <dd>{it.does}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

/** The two overlays, in one Radix Dialog: focus is trapped while open, Escape and a click outside close it. */
export function Overlays() {
  const open = useOverlay((s) => s.open)
  const setOpen = useOverlay((s) => s.setOpen)
  return (
    <Dialog.Root open={open !== null} onOpenChange={(on) => !on && setOpen(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog ${open === 'help' ? 'help-dialog' : 'command-dialog'}`} aria-describedby={undefined}>
          <Dialog.Title className={open === 'help' ? 'dialog-title' : 'sr-only'}>{open === 'help' ? 'Help and keyboard shortcuts' : 'Search actions and settings'}</Dialog.Title>
          {open === 'commands' && (
            <Suspense fallback={null}>
              <CommandMenu />
            </Suspense>
          )}
          {open === 'help' && <HelpSheet />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
