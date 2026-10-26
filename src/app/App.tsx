import { Scene } from '../scene/Scene'
import { TopBar } from '../ui/TopBar'
import { SidePanel } from '../ui/SidePanel'
import { Toast } from '../ui/Toast'
import { useKeyboardShortcuts } from '../ui/useKeyboardShortcuts'

export function App() {
  useKeyboardShortcuts()
  return (
    <div className="app">
      <TopBar />
      <Scene />
      <SidePanel />
      <Toast />
    </div>
  )
}
