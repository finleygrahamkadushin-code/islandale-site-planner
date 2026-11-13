import type { KeyboardEvent, ReactNode } from 'react'
import { Hammer, Map as MapIcon, Presentation, Sofa, type LucideIcon } from 'lucide-react'
import { Tip } from '../guide/Tip'
import { TAB_HINTS, TAB_IDS, TAB_LABELS, useTaskTab, type TaskTab } from './tabs'

const ICONS: Readonly<Record<TaskTab, LucideIcon>> = { site: MapIcon, build: Hammer, interior: Sofa, present: Presentation }

/** The id of the side panel's tab panel, which every tab controls (R10.4). */
export const TASK_PANEL_ID = 'task-panel'

/**
 * The task tabs in the top bar (4B), as a WAI-ARIA tablist: arrow keys move
 * between tabs, the current one is aria-selected, and each controls the side
 * panel's tab panel (TaskPanel), labelled by the current tab. What each tab
 * shows lives with the panels themselves (TabPanel), so nothing here knows a panel.
 */
export function TaskTabs() {
  const tab = useTaskTab((s) => s.tab)
  const setTab = useTaskTab((s) => s.setTab)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = TAB_IDS[(TAB_IDS.indexOf(tab) + step + TAB_IDS.length) % TAB_IDS.length]
    setTab(next)
    document.getElementById(`task-tab-${next}`)?.focus()
  }
  return (
    <div className="task-tabs" role="tablist" aria-label="Task" onKeyDown={onKeyDown}>
      {TAB_IDS.map((id) => {
        const Icon = ICONS[id]
        const on = id === tab
        return (
          <Tip key={id} label={TAB_HINTS[id]}>
            <button
              id={`task-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={TASK_PANEL_ID}
              tabIndex={on ? 0 : -1}
              className="task-tab"
              data-testid={`tab-${id}`}
              onClick={() => setTab(id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="bar-text">{TAB_LABELS[id]}</span>
            </button>
          </Tip>
        )
      })}
    </div>
  )
}

/** The side panel's tab panel (R10.4): what the current tab shows, labelled by that tab. Laid out as if it were not there. */
export function TaskPanel({ children }: { readonly children: ReactNode }) {
  const tab = useTaskTab((s) => s.tab)
  return (
    <div className="task-panel" role="tabpanel" id={TASK_PANEL_ID} aria-labelledby={`task-tab-${tab}`}>
      {children}
    </div>
  )
}

/** Children shown only while their tab is the current one (compound with TaskTabs; one panel can list several tabs). */
export function TabPanel({ tabs, children }: { readonly tabs: readonly TaskTab[]; readonly children: ReactNode }) {
  const tab = useTaskTab((s) => s.tab)
  return tabs.includes(tab) ? <>{children}</> : null
}
