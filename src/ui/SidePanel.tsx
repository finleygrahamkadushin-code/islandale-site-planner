import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { usePlanStore } from '../store/planStore'
import { Inspector } from './Inspector'
import { LayersPanel } from './LayersPanel'
import { EnvironmentPanel } from '../site/environment/EnvironmentPanel'
import { LegendPanel, LotFactsPanel } from '../site/SitePanels'
import { SetbacksPanel } from '../site/rules/SetbacksPanel'
import { ConnectPanel } from '../paths/connect/ConnectPanel'
import { RoutePanel } from '../paths/route/RoutePanels'
import { TabPanel } from '../layout/TaskTabs'
import { InteriorTabPanel, PresentTabPanel } from '../layout/TabPanels'

/**
 * The right-hand panels, by task tab (4B): with something selected, Site and
 * Build show the inspector; with nothing selected, Site shows the lot
 * (facts, layers, sun and tide, legend) and Build the accessible route and
 * layers. Interior and Present have their own panel.
 *
 * Under 900 px wide (4E) the panels become a sheet along the bottom; the
 * grab bar at its top folds it down to that bar and back. Wider, the bar is
 * hidden. Nothing is remembered: the sheet opens unfolded.
 */
export function SidePanel() {
  const hasSelection = usePlanStore((s) => s.selection.length > 0)
  const [folded, setFolded] = useState(false)
  const side = useRef<HTMLElement>(null)
  useSheetHeight(side)
  return (
    <aside className={`side${folded ? ' folded' : ''}`} ref={side} id="side-panel">
      <button type="button" className="sheet-toggle" aria-expanded={!folded} aria-controls="side-panel" onClick={() => setFolded(!folded)} data-testid="sheet-toggle">
        <span className="sheet-grab" aria-hidden="true" />
        {folded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        {folded ? 'Show the panel' : 'Fold the panel down'}
      </button>
      <TabPanel tabs={['site', 'build']}>{hasSelection && <Inspector />}</TabPanel>
      <TabPanel tabs={['site']}>
        {!hasSelection && <LotFactsPanel />}
        {!hasSelection && <SetbacksPanel />}
        {!hasSelection && <LayersPanel />}
        <EnvironmentPanel />
        {!hasSelection && <LegendPanel />}
      </TabPanel>
      <TabPanel tabs={['build']}>
        <ConnectPanel />
        {!hasSelection && <RoutePanel />}
        {!hasSelection && <LayersPanel />}
      </TabPanel>
      <TabPanel tabs={['interior']}>
        <InteriorTabPanel />
      </TabPanel>
      <TabPanel tabs={['present']}>
        <PresentTabPanel />
      </TabPanel>
    </aside>
  )
}

/**
 * The sheet's height on the app as --sheet-height, so the tool strip and the
 * bottom row sit above it on a narrow window. Wide, the panel is not a sheet
 * and the styles ignore the value.
 */
function useSheetHeight(side: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = side.current
    const app = el?.parentElement
    if (!el || !app) return
    const update = () => app.style.setProperty('--sheet-height', `${el.offsetHeight}px`)
    update()
    const watch = new ResizeObserver(update)
    watch.observe(el)
    return () => {
      watch.disconnect()
      app.style.removeProperty('--sheet-height')
    }
  }, [side])
}
