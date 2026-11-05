import { Scene } from '../scene/Scene'
import { TopBar } from '../ui/TopBar'
import { SidePanel } from '../ui/SidePanel'
import { Toast } from '../ui/Toast'
import { ViewStrip } from '../ui/ViewStrip'
import { useKeyboardShortcuts } from '../ui/useKeyboardShortcuts'
import { InteriorEditor } from '../interiors/editor/InteriorEditor'
import { ToolStrip } from '../tools/ToolStrip'
import { ModeChip } from '../tools/ModeChip'
import { BottomBar } from '../layout/BottomBar'
import { Overlays } from '../layout/Overlays'

export function App() {
  useKeyboardShortcuts()
  return (
    <div className="app">
      <TopBar />
      <Scene />
      <ToolStrip />
      <ModeChip />
      <SidePanel />
      <div className="bottom-row">
        <ViewStrip />
        <BottomBar />
      </div>
      <InteriorEditor />
      <Toast />
      <Overlays />
    </div>
  )
}
