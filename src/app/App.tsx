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
import { TipProvider } from '../guide/Tip'
import { ConfirmDialog } from '../guide/ConfirmDialog'
import { TourCard } from '../guide/TourCard'
import { PresentBar } from '../present/PresentBar'
import { usePresent } from '../present/present'

export function App() {
  useKeyboardShortcuts()
  const presenting = usePresent((s) => s.presenting)
  return (
    <TipProvider>
    <div className={`app${presenting ? ' presenting' : ''}`}>
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
      <PresentBar />
      <ConfirmDialog />
      <TourCard />
    </div>
    </TipProvider>
  )
}
