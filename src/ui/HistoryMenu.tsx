import { useState } from 'react'
import { activeAutosave } from '../store/autosave'
import { readSavedText } from '../store/persistence'
import { usePlanStore } from '../store/planStore'
import type { HistoryEntry } from '../store/history'

const timeOf = (iso: string) => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** The last saves, each restorable (one undo step) or downloadable as a plan file. */
export function HistoryMenu() {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<readonly HistoryEntry[]>([])
  const replacePlan = usePlanStore((s) => s.replacePlan)
  const showToast = usePlanStore((s) => s.showToast)

  const toggle = () => {
    if (!open) setEntries(activeAutosave()?.history() ?? [])
    setOpen(!open)
  }

  const restore = (e: HistoryEntry) => {
    try {
      replacePlan(readSavedText(e.text).file.plan)
      showToast(`Restored the ${timeOf(e.savedAt)} save. Undo to go back.`)
      setOpen(false)
    } catch (err) {
      showToast(`That save could not be read: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  const download = (e: HistoryEntry) => {
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
      <button onClick={toggle} className={open ? 'on' : ''} aria-expanded={open} title="The last 20 saves">
        History
      </button>
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
                <button onClick={() => download(e)} title="Download this save as a plan file">
                  ↓
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
