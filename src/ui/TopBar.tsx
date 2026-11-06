import { lazy, Suspense, useCallback, useEffect, useState, useRef, type RefObject } from 'react'
import { useStore } from 'zustand'
import { downloadPlanFile, importPlanFile } from '../export/planFile'
import { exportModel } from '../export/model3d/exportModel'
import { ARCHIVED_SCHEME_IDS, CURRENT_SCHEME_ID, CURRENT_VARIANT_IDS } from '../site/schemes'
import { openScheme, openSchemeNow } from '../site/archive/openScheme'
import { useArchiveOpen } from '../site/archive/archiveOpen'
import { BLANK_PLAN_NAME, usePlanStore } from '../store/planStore'
import { activeTabLock } from '../store/tabLock'
import { HistoryMenu } from './HistoryMenu'
import { TaskTabs } from '../layout/TaskTabs'
import { useOverlay } from '../layout/Overlays'
import { DISPLAY_STYLES, type LabelMode } from '../store/types'
import { DISPLAY_TOGGLES, useDisplayEffects } from '../scene/displayOptions'
import { CircleHelp, Ellipsis } from 'lucide-react'
import { Tip } from '../guide/Tip'
import { ModeSwitch } from '../guide/ModeSwitch'
import { useConfirm } from '../guide/confirm'
import { loadSheets } from '../app/prefetch'
import { ThemeSwitch } from '../app/ThemeSwitch'

// loaded on first use, so the first frame doesn't wait for them (4E)
const DrawingSheets = lazy(() => loadSheets().then((m) => ({ default: m.DrawingSheets })))
const LegacyPlanner = lazy(() => import('./LegacyPlanner').then((m) => ({ default: m.LegacyPlanner })))

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
  const [sheetsOpen, setSheetsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const plan = usePlanStore((s) => s.plan)
  const schemes = usePlanStore((s) => s.schemes)
  const labelMode = usePlanStore((s) => s.labelMode)
  const setLabelMode = usePlanStore((s) => s.setLabelMode)
  const saveStatus = usePlanStore((s) => s.saveStatus)
  const readOnly = usePlanStore((s) => s.readOnly)
  const displayStyle = usePlanStore((s) => s.displayStyle)
  const setDisplayStyle = usePlanStore((s) => s.setDisplayStyle)
  const setDisplayOption = usePlanStore((s) => s.setDisplayOption)
  const effects = useDisplayEffects()
  const canUndo = useStore(usePlanStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(usePlanStore.temporal, (s) => s.futureStates.length > 0)
  const fileInput = useRef<HTMLInputElement>(null)
  const sheetsButton = useRef<HTMLButtonElement>(null)
  const bar = useRef<HTMLElement>(null)
  useTopBarBottom(bar)
  const closeMore = useCallback(() => setMoreOpen(false), [])
  useCloseOnOutside(bar, moreOpen, closeMore)

  const byId = (id: string) => schemes.find((s) => s.id === id)
  const onReset = () =>
    useConfirm.getState().request(
      { title: 'Go back to Scheme C?', body: 'This replaces the current plan with Scheme C as saved in the old planner. You can undo this.', confirmLabel: 'Reset' },
      () => openSchemeNow(CURRENT_SCHEME_ID),
    )
  const onClear = () =>
    useConfirm.getState().request(
      {
        title: 'Clear the whole plan?',
        body: 'This removes every cabin, path, tree and site object, leaving the bare lot. Locked objects stay. You can undo this.',
        confirmLabel: 'Clear',
      },
      () => usePlanStore.getState().clearPlan(),
    )

  return (
    <header className="topbar" ref={bar}>
      <h1>Islandale</h1>
      <TaskTabs />
      <Tip label="Open a scheme (asks first; replaces the plan; undo to go back)">
        <label className="field">
          <span className="muted">Scheme</span>
          <select value={plan.schemeId ?? ''} onChange={(e) => e.target.value && openScheme(e.target.value)}>
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
      <Tip label="Browse every scheme with its plan, description and how it does against the brief">
        <button type="button" data-testid="open-archive" onClick={() => useArchiveOpen.getState().setOpen(true)}>
          Designs…
        </button>
      </Tip>

      <div className="seg" role="group" aria-label="Undo and redo">
        <Tip label="Undo" keyHint="⌘Z">
          <button onClick={() => usePlanStore.temporal.getState().undo()} disabled={!canUndo}>
            Undo
          </button>
        </Tip>
        <Tip label="Redo" keyHint="⇧⌘Z">
          <button onClick={() => usePlanStore.temporal.getState().redo()} disabled={!canRedo}>
            Redo
          </button>
        </Tip>
      </div>

      <div className="seg" role="group" aria-label="Display style">
        <span className="muted">Style</span>
        {DISPLAY_STYLES.map((d, i) => (
          <Tip key={d.id} label={d.label} keyHint={String(i + 1)}>
            <button className={displayStyle === d.id ? 'on' : ''} aria-pressed={displayStyle === d.id} onClick={() => setDisplayStyle(d.id)}>
              {d.label}
            </button>
          </Tip>
        ))}
        <ThemeSwitch />
      </div>

      {/* under 900 px these fold behind the More button; wider, the wrapper has no box of its own */}
      <div className={`topbar-more${moreOpen ? ' open' : ''}`} id="topbar-more" data-testid="topbar-more">
      <ModeSwitch />

      <div className="seg" role="group" aria-label="Display options">
        {DISPLAY_TOGGLES.map((t) => (
          <Tip key={t.id} label={`${t.hint}; picking a style resets it`}>
            <button type="button" className={`small ${effects[t.id] ? 'on' : ''}`} aria-pressed={effects[t.id]} data-testid={`display-${t.id}`} onClick={() => setDisplayOption(t.id, !effects[t.id])}>
              {t.label}
            </button>
          </Tip>
        ))}
      </div>

      <div className="seg" role="group" aria-label="Labels">
        <span className="muted">Labels</span>
        {LABEL_MODES.map((m) => (
          <button key={m.id} className={labelMode === m.id ? 'on' : ''} aria-pressed={labelMode === m.id} onClick={() => setLabelMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="seg" role="group" aria-label="Plan file">
        <Tip label="Download the plan as a JSON file">
          <button onClick={downloadPlanFile}>Export</button>
        </Tip>
        <Tip label="Load a plan from a JSON file">
          <button onClick={() => fileInput.current?.click()}>Import</button>
        </Tip>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Plan file to import"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importPlanFile(f)
            e.target.value = ''
          }}
        />
        <Tip label="Back to Scheme C as saved in the old planner">
          <button onClick={onReset} data-testid="reset-plan">
            Reset
          </button>
        </Tip>
        <Tip label="Remove everything from the plan and start from the bare lot">
          <button onClick={onClear} disabled={!!readOnly} data-testid="clear-plan">
            Clear
          </button>
        </Tip>
        <Tip label="Floor plans and elevations to scale, with every dimension, for drawing by hand">
          <button ref={sheetsButton} onClick={() => setSheetsOpen(true)}>
            Sheets
          </button>
        </Tip>
        <Tip label="The 3D model as a .glb file, with a manifest, for Blender and SketchUp">
          <button onClick={() => void exportModel().catch(() => undefined)} data-testid="export-3d">
            3D model
          </button>
        </Tip>
      </div>

      <HistoryMenu />
      {/* the built app runs as the hosted home, which also serves the old planner next to it */}
      {import.meta.env.PROD && (
        <Tip label="The old planner, sharing the hosted home">
          <button onClick={() => setLegacyOpen(true)}>Old planner</button>
        </Tip>
      )}
      </div>
      <button
        type="button"
        className="topbar-more-toggle"
        aria-expanded={moreOpen}
        aria-controls="topbar-more"
        onClick={() => setMoreOpen(!moreOpen)}
        data-testid="topbar-more-toggle"
      >
        <Ellipsis size={16} aria-hidden="true" /> More
      </button>
      <div className="seg" role="group" aria-label="Search and help">
        <Tip label="Search every action and setting" keyHint="⌘K">
          <button type="button" onClick={() => useOverlay.getState().setOpen('commands')} data-testid="open-commands">
            Search
          </button>
        </Tip>
        <Tip label="Help, the tour and keyboard shortcuts" keyHint="?">
          <button type="button" className="icon-only" onClick={() => useOverlay.getState().setOpen('help')} aria-label="Help and keyboard shortcuts" data-testid="open-help">
            <CircleHelp size={16} aria-hidden="true" />
          </button>
        </Tip>
      </div>

      <Suspense fallback={<span className="toast" role="status">Opening…</span>}>
        {legacyOpen && <LegacyPlanner onClose={() => setLegacyOpen(false)} />}
        {sheetsOpen && <DrawingSheets onClose={() => setSheetsOpen(false)} opener={sheetsButton.current} />}
      </Suspense>

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

/** Close the More menu on a press outside the top bar or on Escape. */
function useCloseOnOutside(bar: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [bar, open, close])
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
