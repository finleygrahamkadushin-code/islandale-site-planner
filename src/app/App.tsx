import { Scene } from '../scene/Scene'
import { TopBar } from '../ui/TopBar'
import { SidePanel } from '../ui/SidePanel'
import { Toast } from '../ui/Toast'
import { ViewStrip } from '../ui/ViewStrip'
import { useKeyboardShortcuts } from '../ui/useKeyboardShortcuts'
import { lazy, Suspense } from 'react'
import { useInteriorView } from '../interiors/editor/interiorView'
import { ToolStrip } from '../tools/ToolStrip'
import { ModeChip } from '../tools/ModeChip'
import { BottomBar } from '../layout/BottomBar'
import { Overlays } from '../layout/Overlays'
import { TipProvider } from '../guide/Tip'
import { ConfirmDialog } from '../guide/ConfirmDialog'
import { TourCard } from '../guide/TourCard'
import { PresentBar } from '../present/PresentBar'
import { loadInteriorEditor } from './prefetch'
import { usePresent } from '../present/present'

// loaded on first use, so the first frame doesn't wait for them (4E)
const InteriorEditor = lazy(() => loadInteriorEditor().then((m) => ({ default: m.InteriorEditor })))

export function App() {
  useKeyboardShortcuts()
  const presenting = usePresent((s) => s.presenting)
  const interiorOpen = useInteriorView((s) => s.objectId !== null)
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
      {interiorOpen && (
        <Suspense fallback={null}>
          <InteriorEditor />
        </Suspense>
      )}
      <Toast />
      <Overlays />
      <PresentBar />
      <ConfirmDialog />
      <TourCard />
    </div>
    </TipProvider>
  )
}
