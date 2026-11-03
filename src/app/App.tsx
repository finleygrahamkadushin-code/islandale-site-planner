import { Scene } from '../scene/Scene'
import { TopBar } from '../ui/TopBar'
import { SidePanel } from '../ui/SidePanel'
import { Toast } from '../ui/Toast'
import { ViewStrip } from '../ui/ViewStrip'
import { useKeyboardShortcuts } from '../ui/useKeyboardShortcuts'
import { InteriorEditor } from '../ui/interior/InteriorEditor'

export function App() {
  useKeyboardShortcuts()
  return (
    <div className="app">
      <TopBar />
      <Scene />
      <SidePanel />
      <ViewStrip />
      <InteriorEditor />
      <Toast />
    </div>
  )
}
