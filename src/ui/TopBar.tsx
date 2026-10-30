import { useEffect, useState, useRef, type RefObject } from 'react'
import { useStore } from 'zustand'
import { downloadPlanFile, importPlanFile } from '../export/planFile'
import { ARCHIVED_SCHEME_IDS, CURRENT_SCHEME_ID, CURRENT_VARIANT_IDS } from '../site/schemes'
import { usePlanStore } from '../store/planStore'
import { activeTabLock } from '../store/tabLock'
import { HistoryMenu } from './HistoryMenu'
import { LegacyPlanner } from './LegacyPlanner'
import { DISPLAY_STYLES, type LabelMode } from '../store/types'

const LABEL_MODES: readonly { readonly id: LabelMode; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'selected', label: 'Selected' },
  { id: 'none', label: 'None' },
]

const SAVE_TEXT = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Not saved', loading: 'Loading…' } as const
const READ_ONLY_TEXT = {
  opening: 'Opening the saved plan…',
  'other-tab': 'Read-only: open in another tab',
  'newer-file': 'Read-only: saved by a newer planner',
  'unsafe-save': 'Read-only: the old save is protected',
} as const

export function TopBar() {
  const [legacyOpen, setLegacyOpen] = useState(false)
  const plan = usePlanStore((s) => s.plan)
  const schemes = usePlanStore((s) => s.schemes)
  const labelMode = usePlanStore((s) => s.labelMode)
  const setLabelMode = usePlanStore((s) => s.setLabelMode)
  const loadScheme = usePlanStore((s) => s.loadScheme)
  const saveStatus = usePlanStore((s) => s.saveStatus)
  const readOnly = usePlanStore((s) => s.readOnly)
  const displayStyle = usePlanStore((s) => s.displayStyle)
  const setDisplayStyle = usePlanStore((s) => s.setDisplayStyle)
  const canUndo = useStore(usePlanStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(usePlanStore.temporal, (s) => s.futureStates.length > 0)
  const fileInput = useRef<HTMLInputElement>(null)
  const bar = useRef<HTMLElement>(null)
  useTopBarBottom(bar)

  const byId = (id: string) => schemes.find((s) => s.id === id)
  const onReset = () => {
    if (window.confirm('Replace the current plan with Scheme C as saved in the old planner? You can undo this.')) loadScheme(CURRENT_SCHEME_ID)
  }

  return (
    <header className="topbar" ref={bar}>
      <h1>Islandale</h1>
      <label className="field">
        <span className="muted">Scheme</span>
        <select
          value={plan.schemeId ?? ''}
          onChange={(e) => e.target.value && loadScheme(e.target.value)}
          title="Load a scheme (replaces the plan; undo to go back)"
        >
          {!plan.schemeId && <option value="">Imported plan</option>}
          <optgroup label="Current">
            <option value={CURRENT_SCHEME_ID}>{byId(CURRENT_SCHEME_ID)?.name}</option>
          </optgroup>
          <optgroup label="Prow variants">
            {CURRENT_VARIANT_IDS.map((id) => (
              <option key={id} value={id}>
                {byId(id)?.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Old designs">
            {ARCHIVED_SCHEME_IDS.map((id) => (
              <option key={id} value={id}>
                {byId(id)?.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <div className="seg" role="group" aria-label="Undo and redo">
        <button onClick={() => usePlanStore.temporal.getState().undo()} disabled={!canUndo} title="Undo (⌘Z)">
          Undo
        </button>
        <button onClick={() => usePlanStore.temporal.getState().redo()} disabled={!canRedo} title="Redo (⇧⌘Z)">
          Redo
        </button>
      </div>

      <div className="seg" role="group" aria-label="Display style">
        <span className="muted">Style</span>
        {DISPLAY_STYLES.map((d) => (
          <button key={d.id} className={displayStyle === d.id ? 'on' : ''} onClick={() => setDisplayStyle(d.id)}>
            {d.label}
          </button>
        ))}
      </div>

      <div className="seg" role="group" aria-label="Labels">
        <span className="muted">Labels</span>
        {LABEL_MODES.map((m) => (
          <button key={m.id} className={labelMode === m.id ? 'on' : ''} onClick={() => setLabelMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="seg" role="group" aria-label="Plan file">
        <button onClick={downloadPlanFile} title="Download the plan as a JSON file">
          Export
        </button>
        <button onClick={() => fileInput.current?.click()} title="Load a plan from a JSON file">
          Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importPlanFile(f)
            e.target.value = ''
          }}
        />
        <button onClick={onReset} title="Back to Scheme C as saved in the old planner">
          Reset
        </button>
      </div>

      <HistoryMenu />

      {/* the built app runs as the hosted home, which also serves the old planner next to it */}
      {import.meta.env.PROD && (
        <button onClick={() => setLegacyOpen(true)} title="The old planner, sharing the hosted home">
          Old planner
        </button>
      )}
      {legacyOpen && <LegacyPlanner onClose={() => setLegacyOpen(false)} />}

      {readOnly && (
        <span className="readonly" data-testid="read-only">
          {READ_ONLY_TEXT[readOnly]}
          {readOnly === 'other-tab' && (
            <button onClick={() => void activeTabLock()?.takeOver()} title="Move editing to this tab; the other tab saves and becomes read-only">
              Take over editing
            </button>
          )}
        </span>
      )}

      <span className={`muted save ${saveStatus}`} data-testid="save-status">
        {SAVE_TEXT[saveStatus]}
      </span>
    </header>
  )
}

/**
 * The bar wraps to two rows or more on a narrow window; chips under it (the
 * part HUD) read its bottom edge from --topbar-bottom on the app, so they
 * sit below it whatever its height.
 */
function useTopBarBottom(bar: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = bar.current
    const app = el?.parentElement
    if (!el || !app) return
    const update = () => app.style.setProperty('--topbar-bottom', `${el.offsetTop + el.offsetHeight}px`)
    update()
    const watch = new ResizeObserver(update)
    watch.observe(el)
    return () => {
      watch.disconnect()
      app.style.removeProperty('--topbar-bottom')
    }
  }, [bar])
}
