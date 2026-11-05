import { usePlanStore } from '../store/planStore'
import { Inspector } from './Inspector'
import { LayersPanel } from './LayersPanel'
import { EnvironmentPanel } from '../site/environment/EnvironmentPanel'
import { PathLibrary } from '../paths/PathPanels'
import { ConnectPanel } from '../paths/connect/ConnectPanel'
import { RoutePanel } from '../paths/route/RoutePanels'

export function SidePanel() {
  const hasSelection = usePlanStore((s) => s.selection.length > 0)
  return (
    <aside className="side">
      {hasSelection ? <Inspector /> : <LayersPanel />}
      <ConnectPanel />
      <PathLibrary />
      {!hasSelection && <RoutePanel />}
      <EnvironmentPanel />
    </aside>
  )
}
