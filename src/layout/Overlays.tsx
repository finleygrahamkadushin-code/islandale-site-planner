import { useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { create } from 'zustand'
import { usePlanStore } from '../store/planStore'
import { commandsFor, type Command as Cmd } from './commands'
import { SHORTCUT_GROUPS } from './shortcuts'

/** Which overlay is open: command search (Cmd/Ctrl+K) or the Help sheet (?). View state. */
export const useOverlay = create<{ readonly open: 'commands' | 'help' | null; readonly setOpen: (o: 'commands' | 'help' | null) => void }>((set) => ({
  open: null,
  setOpen: (open) => set({ open }),
}))

/** Command search (4B): every action and the selected object's settings, filtered as you type; Enter runs one and closes. */
function CommandMenu() {
  const setOpen = useOverlay((s) => s.setOpen)
  const cmds = useMemo(() => commandsFor(usePlanStore.getState()), [])
  const groups = useMemo(() => [...new Set(cmds.map((c) => c.group))], [cmds])
  const run = (c: Cmd) => {
    setOpen(null)
    c.run()
  }
  return (
    <Command label="Search actions and settings" className="command" loop>
      <Command.Input className="command-input" placeholder="Search actions and settings…" autoFocus data-testid="command-input" />
      <Command.List className="command-list">
        <Command.Empty className="muted command-empty">Nothing matches. Try “lock”, “roof” or “golden”.</Command.Empty>
        {groups.map((g) => (
          <Command.Group key={g} heading={g} className="command-group">
            {cmds
              .filter((c) => c.group === g)
              .map((c) => (
                <Command.Item key={c.id} value={`${c.label} ${c.group}`} onSelect={() => run(c)} className="command-item" data-testid={`command-${c.id}`}>
                  <span>{c.label}</span>
                  {c.keys && <kbd>{c.keys}</kbd>}
                </Command.Item>
              ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  )
}

function HelpSheet() {
  return (
    <div className="help-sheet" data-testid="help-sheet">
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
          <Dialog.Title className={open === 'help' ? 'dialog-title' : 'sr-only'}>{open === 'help' ? 'Keyboard shortcuts' : 'Search actions and settings'}</Dialog.Title>
          {open === 'commands' && <CommandMenu />}
          {open === 'help' && <HelpSheet />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
