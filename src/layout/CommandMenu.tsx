import { useMemo } from 'react'
import { Command } from 'cmdk'
import { usePlanStore } from '../store/planStore'
import { commandsFor, type Command as Cmd } from './commands'
import { useOverlay } from './Overlays'

/** Command search (4B): every action and the selected object's settings, filtered as you type; Enter runs one and closes. */
export function CommandMenu() {
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

