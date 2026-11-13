import { useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { usePlanStore } from '../store/planStore'
import { commandsFor, objectCommands, type Command as Cmd } from './commands'
import { useOverlay } from './Overlays'

/**
 * Command search (4B): every action and the selected object's settings, filtered as you type; Enter runs one and closes.
 * Once something is typed, "Select …" entries for the plan's objects join them (R10.1); a Select or Place
 * entry sends focus to the 3D view when it closes.
 */
export function CommandMenu() {
  const setOpen = useOverlay((s) => s.setOpen)
  const [search, setSearch] = useState('')
  const actions = useMemo(() => commandsFor(usePlanStore.getState()), [])
  const objects = useMemo(() => objectCommands(usePlanStore.getState()), [])
  // a long list of trees only once something is typed, after the actions
  const cmds = useMemo(() => (search.trim() ? [...actions, ...objects] : actions), [search, actions, objects])
  const groups = useMemo(() => [...new Set(cmds.map((c) => c.group))], [cmds])
  const run = (c: Cmd) => {
    if (c.focusView) useOverlay.getState().focusViewOnClose()
    setOpen(null)
    c.run()
  }
  return (
    <Command label="Search actions and settings" className="command" loop>
      <Command.Input
        className="command-input"
        placeholder="Search actions, settings and objects…"
        value={search}
        onValueChange={setSearch}
        autoFocus
        data-testid="command-input"
      />
      <Command.List className="command-list">
        <Command.Empty className="muted command-empty">Nothing matches. Try “lock”, “roof” or “golden”.</Command.Empty>
        {groups.map((g) => (
          <Command.Group key={g} heading={g} className="command-group">
            {cmds
              .filter((c) => c.group === g)
              .map((c) => (
                <Command.Item key={c.id} value={`${c.label} ${c.detail ?? ''} ${c.group} ${c.id}`} onSelect={() => run(c)} className="command-item" data-testid={`command-${c.id}`}>
                  <span className="command-label">
                    {c.label}
                    {c.detail && <span className="command-detail">{c.detail}</span>}
                  </span>
                  {c.keys && <kbd>{c.keys}</kbd>}
                </Command.Item>
              ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  )
}

