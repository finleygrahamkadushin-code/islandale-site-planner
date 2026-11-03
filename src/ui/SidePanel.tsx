import { usePlanStore } from '../store/planStore'
import { Inspector } from './Inspector'
import { LayersPanel } from './LayersPanel'
import { EnvironmentPanel } from './EnvironmentPanel'
import { PathLibrary } from './PathPanels'
import { ConnectPanel } from './ConnectPanel'
import { RoutePanel } from './RoutePanels'

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
