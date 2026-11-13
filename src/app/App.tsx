import { ArchiveDialog } from '../site/archive/ArchiveDialog'
import { Scene } from '../scene/Scene'
import { TopBar } from '../ui/TopBar'
import { SidePanel } from '../ui/SidePanel'
import { Toast } from '../ui/Toast'
import { Announcer } from '../ui/Announcer'
import { ViewStrip } from '../ui/ViewStrip'
import { useKeyboardShortcuts } from '../ui/useKeyboardShortcuts'
import { lazy, Suspense, useState } from 'react'
import { useInteriorView } from '../interiors/editor/interiorView'
import { ToolStrip } from '../tools/ToolStrip'
import { ModeChip } from '../tools/ModeChip'
import { IsolateChip } from '../tools/IsolateChip'
import { BottomBar } from '../layout/BottomBar'
import { Overlays } from '../layout/Overlays'
import { TipProvider } from '../guide/Tip'
import { ConfirmDialog } from '../guide/ConfirmDialog'
import { TourCard } from '../guide/TourCard'
import { PresentBar } from '../present/PresentBar'
import { loadInteriorEditor } from './prefetch'
import { usePresent } from '../present/present'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { CrashNote } from '../ui/CrashNote'

// loaded on first use, so the first frame doesn't wait for them (4E)
const lazyInteriorEditor = () => lazy(() => loadInteriorEditor().then((m) => ({ default: m.InteriorEditor })))

const reloadPage = (): void => window.location.reload()

/** The 3D view broke while drawing: the rest of the app (top bar, undo, saving) keeps working around this. */
function SceneCrash({ retry }: { readonly retry: () => void }) {
  return (
    <CrashNote className="viewport" title="The 3D view stopped working" actions={[{ label: 'Try again', onClick: retry }, { label: 'Reload the page', onClick: reloadPage }]}>
      Your plan is kept, and the rest of the planner still works. If a change you just made caused this, Undo it and then Try again.
    </CrashNote>
  )
}

/** The room editor would not load or broke while open. */
function EditorCrash() {
  return (
    <CrashNote className="int-editor" title="The room editor could not open" actions={[{ label: 'Back to the 3D view', onClick: () => useInteriorView.getState().close() }]}>
      Your plan is kept. Check the connection and open the rooms again, or reload the page.
    </CrashNote>
  )
}

export function App() {
  useKeyboardShortcuts()
  const presenting = usePresent((s) => s.presenting)
  const interiorOpen = useInteriorView((s) => s.objectId !== null)
  // a chunk that failed to load stays failed inside React.lazy, so a fresh one lets the next open try again
  const [InteriorEditor, setInteriorEditor] = useState(lazyInteriorEditor)
  return (
    <TipProvider>
    <div className={`app${presenting ? ' presenting' : ''}`}>
      <TopBar />
      <ErrorBoundary name="3D view" fallback={(retry) => <SceneCrash retry={retry} />}>
        <Scene />
      </ErrorBoundary>
      <ToolStrip />
      <ModeChip />
      <IsolateChip />
      <SidePanel />
      <div className="bottom-row">
        <ViewStrip />
        <BottomBar />
      </div>
      {interiorOpen && (
        <ErrorBoundary name="Room editor" fallback={<EditorCrash />} onError={() => setInteriorEditor(lazyInteriorEditor)}>
          <Suspense fallback={null}>
            <InteriorEditor />
          </Suspense>
        </ErrorBoundary>
      )}
      <Toast />
      <Announcer />
      <Overlays />
      <ArchiveDialog />
      <PresentBar />
      <ConfirmDialog />
      <TourCard />
    </div>
    </TipProvider>
  )
}
