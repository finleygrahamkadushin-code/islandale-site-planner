import { useEffect, useRef, type RefObject } from 'react'
import { useStore } from 'zustand'
import { ARCHIVED_SCHEME_IDS, CURRENT_SCHEME_ID, CURRENT_VARIANT_IDS } from '../site/schemes'
import { openScheme } from '../site/archive/openScheme'
import { BLANK_PLAN_NAME, redoPlan, undoPlan, usePlanStore } from '../store/planStore'
import { activeTabLock } from '../store/tabLock'
import { TaskTabs } from '../layout/TaskTabs'
import { useOverlay } from '../layout/Overlays'
import { CircleHelp, Redo2, Search, Undo2 } from 'lucide-react'
import { Tip } from '../guide/Tip'
import { ModeSwitch } from '../guide/ModeSwitch'
import { keys } from './keyHint'
import { FileMenu } from './FileMenu'
import { ViewMenu } from './ViewMenu'

const SAVE_TEXT = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Not saved', loading: 'Loading…' } as const
const READ_ONLY_TEXT = {
  opening: 'Opening the saved plan…',
  'other-tab': 'Read-only: open in another tab',
  'newer-file': 'Read-only: saved by a newer planner',
  'unsafe-save': 'Read-only: the old save is protected',
} as const

/**
 * One row (R9.1, decision 6): the task tabs, the scheme, undo and redo, the
 * mode, the File and View menus, search, help and the save status. The
 * labels of the tabs, undo, redo and search fold to their icons where the
 * row is short (styles.css, "Top bar (R9.1)"); on a phone it takes two rows.
 */
export function TopBar() {
  const plan = usePlanStore((s) => s.plan)
  const schemes = usePlanStore((s) => s.schemes)
  const saveStatus = usePlanStore((s) => s.saveStatus)
  const readOnly = usePlanStore((s) => s.readOnly)
  const canUndo = useStore(usePlanStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(usePlanStore.temporal, (s) => s.futureStates.length > 0)
  const bar = useRef<HTMLElement>(null)
  useTopBarBottom(bar)

  const byId = (id: string) => schemes.find((s) => s.id === id)

  return (
    <header className="topbar" ref={bar}>
      <h1>Islandale</h1>
      <TaskTabs />
      <Tip label="Open a scheme (asks first; replaces the plan; undo to go back)">
        <label className="field scheme-field">
          <span className="muted bar-text">Scheme</span>
          <select value={plan.schemeId ?? ''} onChange={(e) => e.target.value && openScheme(e.target.value)} data-testid="scheme-select">
            {!plan.schemeId && <option value="">{plan.name === BLANK_PLAN_NAME ? BLANK_PLAN_NAME : 'Imported plan'}</option>}
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
      </Tip>

      <div className="seg topbar-undo" role="group" aria-label="Undo and redo">
        <Tip label="Undo" keyHint={keys('Mod+Z')}>
          <button type="button" className="bar-button" onClick={() => undoPlan()} disabled={!canUndo} aria-label="Undo">
            <Undo2 size={15} aria-hidden="true" />
            <span className="bar-text">Undo</span>
          </button>
        </Tip>
        <Tip label="Redo" keyHint={keys('Shift+Mod+Z')}>
          <button type="button" className="bar-button" onClick={() => redoPlan()} disabled={!canRedo} aria-label="Redo">
            <Redo2 size={15} aria-hidden="true" />
            <span className="bar-text">Redo</span>
          </button>
        </Tip>
      </div>

      <ModeSwitch />

      <div className="seg topbar-menus" role="group" aria-label="Menus">
        <FileMenu />
        <ViewMenu />
      </div>

      <div className="seg topbar-help" role="group" aria-label="Search and help">
        <Tip label="Search every action and setting" keyHint={keys('Mod+K')}>
          <button type="button" className="bar-button" onClick={() => useOverlay.getState().setOpen('commands')} data-testid="open-commands" aria-label="Search">
            <Search size={15} aria-hidden="true" />
            <span className="bar-text">Search</span>
          </button>
        </Tip>
        <Tip label="Help, the tour and keyboard shortcuts" keyHint="?">
          <button type="button" className="icon-only" onClick={() => useOverlay.getState().setOpen('help')} aria-label="Help and keyboard shortcuts" data-testid="open-help">
            <CircleHelp size={16} aria-hidden="true" />
          </button>
        </Tip>
      </div>

      {readOnly && (
        <span className="readonly" data-testid="read-only">
          {READ_ONLY_TEXT[readOnly]}
          {readOnly === 'other-tab' && (
            <Tip label="Move editing to this tab; the other tab saves and becomes read-only">
              <button onClick={() => void activeTabLock()?.takeOver()}>Take over editing</button>
            </Tip>
          )}
        </span>
      )}

      <span className={`muted save ${saveStatus}`} data-testid="save-status" aria-live="polite">
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
