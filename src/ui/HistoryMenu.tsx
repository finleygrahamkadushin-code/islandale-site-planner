import { useState } from 'react'
import { activeAutosave, type SetAsideCopy } from '../store/autosave'
import { describeSkipped, readSavedText } from '../store/persistence'
import { usePlanStore } from '../store/planStore'
import type { HistoryEntry } from '../store/history'
import { Tip } from '../guide/Tip'

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
 */
export function HistoryMenu() {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<readonly HistoryEntry[]>([])
  const [setAside, setSetAside] = useState<readonly SetAsideCopy[]>([])
  const replacePlan = usePlanStore((s) => s.replacePlan)
  const showToast = usePlanStore((s) => s.showToast)

  const toggle = () => {
    if (!open) {
      setEntries(activeAutosave()?.history() ?? [])
      setSetAside([])
      activeAutosave()
        ?.setAside()
        .then(setSetAside)
        .catch((err) => console.error('[history] could not list the set-aside saves', err))
    }
    setOpen(!open)
  }

  const restore = (e: Pick<HistoryEntry, 'savedAt' | 'text'>) => {
    try {
      const { file, skipped } = readSavedText(e.text)
      const before = usePlanStore.getState().plan
      replacePlan(file.plan)
      if (usePlanStore.getState().plan === before) return // refused: the toast says why
      const left = skipped.length ? ` ${describeSkipped(skipped)}.` : ''
      showToast(`Restored the ${timeOf(e.savedAt)} save. Undo to go back.${left}`)
      setOpen(false)
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
    <div className="history">
      <Tip label="The last 20 saves">
        <button onClick={toggle} className={open ? 'on' : ''} aria-expanded={open}>
          History
        </button>
      </Tip>
      {open && (
        <div className="history-list" role="menu" data-testid="history-list">
          {entries.length === 0 && <p className="muted small">No saves yet.</p>}
          {entries.map((e, i) => (
            <div key={`${e.savedAt}-${i}`} className="history-row">
              <span>
                <strong>{timeOf(e.savedAt)}</strong> <span className="muted">{e.label}</span>
              </span>
              <span className="seg">
                <button onClick={() => restore(e)} role="menuitem">
                  Restore
                </button>
                <Tip label="Download this save as a plan file">
                  <button onClick={() => download(e)} aria-label="Download this save as a plan file">
                    ↓
                  </button>
                </Tip>
              </span>
            </div>
          ))}
          {setAside.map((c) => (
            <div key={c.key} className="history-row" data-testid="history-set-aside">
              <span>
                <strong>{timeOf(c.savedAt)}</strong> <span className="muted">{setAsideLabel(c)}</span>
              </span>
              <span className="seg">
                <Tip label="Open what can be read of this save (one undo step)">
                  <button onClick={() => restore(c)} role="menuitem">
                    Open
                  </button>
                </Tip>
                <Tip label="Download this save exactly as it was kept">
                  <button onClick={() => download(c)} aria-label="Download this set-aside save as it was kept">
                    ↓
                  </button>
                </Tip>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
