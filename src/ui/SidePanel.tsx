import { usePlanStore } from '../store/planStore'
import { Inspector } from './Inspector'
import { LayersPanel } from './LayersPanel'
import { EnvironmentPanel } from './EnvironmentPanel'

export function SidePanel() {
  const hasSelection = usePlanStore((s) => s.selection.length > 0)
  return (
    <aside className="side">
      {hasSelection ? <Inspector /> : <LayersPanel />}
      <EnvironmentPanel />
    </aside>
  )
}
