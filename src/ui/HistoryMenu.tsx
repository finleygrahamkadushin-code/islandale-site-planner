import { useState } from 'react'
import { activeAutosave, type SetAsideCopy } from '../store/autosave'
import { describeSkipped, readSavedText } from '../store/persistence'
import { usePlanStore } from '../store/planStore'
import type { HistoryEntry } from '../store/history'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { ChevronRight } from 'lucide-react'
import { MenuText } from './TopMenu'

const timeOf = (iso: string) => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Kept aside, with the reason it could not be opened whole. */
const setAsideLabel = (c: SetAsideCopy): string => {
  try {
    const { skipped } = readSavedText(c.text)
    return skipped.length ? `set aside: ${skipped.length === 1 ? '1 object' : `${skipped.length} objects`} could not be read` : 'set aside'
  } catch {
    return 'set aside: could not be read'
  }
}

/**
 * The last saves, each restorable (one undo step) or downloadable as a plan
 * file; below them, any save set aside because it could not be read whole.
 * A submenu of File (R9.1); the list is read each time it opens.
 */
export function HistorySub() {
  const [entries, setEntries] = useState<readonly HistoryEntry[]>([])
  const [setAside, setSetAside] = useState<readonly SetAsideCopy[]>([])
  const replacePlan = usePlanStore((s) => s.replacePlan)
  const showToast = usePlanStore((s) => s.showToast)

  const onOpenChange = (open: boolean) => {
    if (!open) return
    setEntries(activeAutosave()?.history() ?? [])
    setSetAside([])
    activeAutosave()
      ?.setAside()
      .then(setSetAside)
      .catch((err) => console.error('[history] could not list the set-aside saves', err))
  }

  const restore = (e: Pick<HistoryEntry, 'savedAt' | 'text'>) => {
    try {
      const { file, skipped } = readSavedText(e.text)
      const before = usePlanStore.getState().plan
      replacePlan(file.plan)
      if (usePlanStore.getState().plan === before) return // refused: the toast says why
      const left = skipped.length ? ` ${describeSkipped(skipped)}.` : ''
      showToast(`Restored the ${timeOf(e.savedAt)} save. Undo to go back.${left}`)
    } catch (err) {
      showToast(`That save could not be read: ${err instanceof Error ? err.message : 'unknown error'}. Download it to repair it by hand.`)
    }
  }

  const download = (e: Pick<HistoryEntry, 'savedAt' | 'text'>) => {
    const url = URL.createObjectURL(new Blob([e.text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `islandale-${e.savedAt.replace(/[:.]/g, '-')}.islandale.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Menu.Sub onOpenChange={onOpenChange}>
      <Menu.SubTrigger className="menu-item" data-testid="open-history">
        <MenuText hint="The last 20 saves, to restore or download">History</MenuText>
        <ChevronRight size={14} aria-hidden="true" className="menu-keys" />
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent className="topbar-menu history-list" data-testid="history-list" sideOffset={4} collisionPadding={8} loop>
          <Menu.Label className="menu-label">The last 20 saves</Menu.Label>
          {entries.length === 0 && <p className="muted small history-empty">No saves yet.</p>}
          {entries.map((e, i) => (
            <Menu.Group key={`${e.savedAt}-${i}`} className="history-row">
              <span>
                <strong>{timeOf(e.savedAt)}</strong> <span className="muted">{e.label}</span>
              </span>
              <Menu.Item className="menu-item" onSelect={() => restore(e)}>
                Restore
              </Menu.Item>
              <Menu.Item className="menu-item" onSelect={() => download(e)} aria-label="Download this save as a plan file">
                ↓
              </Menu.Item>
            </Menu.Group>
          ))}
          {setAside.map((c) => (
            <Menu.Group key={c.key} className="history-row" data-testid="history-set-aside">
              <span>
                <strong>{timeOf(c.savedAt)}</strong> <span className="muted">{setAsideLabel(c)}</span>
              </span>
              <Menu.Item className="menu-item" onSelect={() => restore(c)}>
                Open
              </Menu.Item>
              <Menu.Item className="menu-item" onSelect={() => download(c)} aria-label="Download this set-aside save as it was kept">
                ↓
              </Menu.Item>
            </Menu.Group>
          ))}
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  )
}
