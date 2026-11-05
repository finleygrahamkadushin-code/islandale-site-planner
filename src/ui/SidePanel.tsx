import { usePlanStore } from '../store/planStore'
import { Inspector } from './Inspector'
import { LayersPanel } from './LayersPanel'
import { EnvironmentPanel } from '../site/environment/EnvironmentPanel'
import { LegendPanel, LotFactsPanel } from '../site/SitePanels'
import { ConnectPanel } from '../paths/connect/ConnectPanel'
import { RoutePanel } from '../paths/route/RoutePanels'
import { TabPanel } from '../layout/TaskTabs'
import { InteriorTabPanel, PresentTabPanel } from '../layout/TabPanels'

/**
 * The right-hand panels, by task tab (4B): with something selected, Site and
 * Build show the inspector; with nothing selected, Site shows the lot
 * (facts, layers, sun and tide, legend) and Build the accessible route and
 * layers. Interior and Present have their own panel.
 */
export function SidePanel() {
  const hasSelection = usePlanStore((s) => s.selection.length > 0)
  return (
    <aside className="side">
      <TabPanel tabs={['site', 'build']}>{hasSelection && <Inspector />}</TabPanel>
      <TabPanel tabs={['site']}>
        {!hasSelection && <LotFactsPanel />}
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
