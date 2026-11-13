import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { usePlanStore } from '../store/planStore'
import { Terrain } from '../site/TerrainMesh'
import { RetainingWalls } from '../site/earthworks/RetainingWalls'
import { ParcelLine } from '../site/ParcelLine'
import { SiteMarks } from '../site/SiteMarks'
import { PlanObjects } from './PlanObjects'
import { LabelLayer } from './LabelLayer'
import { LabelProjector } from './LabelProjector'
import { EditGizmos } from './EditGizmos'
import { SceneEnvironment } from '../site/environment/SceneEnvironment'
import { CameraRig } from './CameraRig'
import { SheetCapture } from '../export/sheets/elevation/ElevationCapture'
import { PartHud } from '../buildings/parts/PartHud'
import { PaintHud } from '../buildings/paint/PaintHud'
import { ChipLayer } from './ChipLayer'
import { PlaceGhost } from './PlaceGhost'
import { MeasureLayer } from '../tools/MeasureLayer'
import { ClearanceMarks } from '../site/rules/ClearanceMarks'
import { BoxSelectLayer, boxJustEnded } from '../tools/useBoxSelect'
import { ConnectLayer } from '../paths/connect/ConnectLayer'
import { JunctionLayer } from '../paths/junctions/JunctionLayer'
import { RouteChips } from '../paths/route/RouteChips'
import { NoToneMapping } from 'three'
import { onGround } from './frame'
import { useLiveDrag, type DragState } from './editing'
import { ContactShadows } from './ContactShadows'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { useSplash } from '../present/viewState'
import { PLAN_VIEW_ID } from './planView'

// AO, tone mapping and anti-aliasing arrive just after the first frame, so the view shows sooner (4E)
const Effects = lazy(() => import('./Effects').then((m) => ({ default: m.Effects })))
import { usePresent, isPresenting } from '../present/present'
import { ViewProbe } from '../present/ViewProbe'
import { ModelExportProbe } from '../export/model3d/ModelExportProbe'
import { CompassScale } from '../present/CompassScale'
import { Splash } from '../present/Splash'
import { NoWebGL } from '../present/NoWebGL'
import { hasWebGL2 } from '../present/webgl'
import { useIsolate, wasClaimed } from '../tools/isolate'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { RedrawOnChange } from './RedrawOnChange'
import { OrbitSettle } from './OrbitSettle'

/** The slow orbit in Present mode, degrees a second at OrbitControls' speed 1 is 6. */
const ORBIT_SPEED = 0.6

/** The live drag, read where it is drawn: a pointer move re-renders only what follows it, not the whole scene (R8.3). */
function WithDrag({ children }: { readonly children: (drag: DragState | null) => ReactNode }) {
  return children(useLiveDrag((s) => s.drag))
}

export function Scene() {
  const site = usePlanStore((s) => s.site)
  const select = usePlanStore((s) => s.select)
  const target = onGround(site.terrain, 0, 0)
  const [webgl] = useState(() => hasWebGL2())
  const presenting = usePresent((s) => s.presenting)
  const orbit = usePresent((s) => s.orbit)
  const firstFrameDrawn = useSplash((s) => s.ready)
  // isolate mode: the route and junction chips belong to the whole site, so they step aside
  const isolating = useIsolate((s) => s.isolation !== null)
  if (!webgl) return <NoWebGL />
  return (
    // isolate mode: a double-click that no object took (empty space, the ground, a faded object) leaves it
    // a keyboard target too (R10.1): after Select or Place in command search focus lands here, where the arrows act
    <div
      className="viewport"
      id={PLAN_VIEW_ID}
      tabIndex={0}
      role="application"
      aria-label="3D view of the plan"
      aria-describedby="plan-view-keys"
      data-tour="view"
      onDoubleClick={(e) => !wasClaimed(e.nativeEvent) && useIsolate.getState().leave()}
    >
    <p id="plan-view-keys" className="sr-only">
      Arrow keys move the selection or the object being placed 1 foot north, south, east or west, 5 feet with Shift. Q and E turn it 5 degrees, R a quarter turn. Enter puts down an object being placed. Delete removes the selection. Escape stops placing or clears the selection. Command search selects and places objects by name.
    </p>
    <LabelLayer />
    <WithDrag>{(drag) => <PartHud drag={drag} />}</WithDrag>
    <PaintHud />
    <Canvas
      shadows="percentage"
      camera={{ position: [target[0] + 32, target[1] + 26, target[2] + 40], fov: 45, near: 0.5, far: 8000 }}
      gl={{ antialias: false, toneMapping: NoToneMapping }}
      // draw only when something changes (R8.1): see RedrawOnChange and each animation's invalidate()
      frameloop="demand"
      // a click on nothing clears the selection, but not the click that ends a box select
      onPointerMissed={() => !boxJustEnded() && !isPresenting() && select([])}
    >
      <SceneEnvironment />
      <Terrain terrain={site.terrain} />
      <RetainingWalls />
      <ParcelLine parcel={site.parcel} terrain={site.terrain} />
      <SiteMarks parcel={site.parcel} terrain={site.terrain} />
      <WithDrag>{(drag) => <PlanObjects drag={drag} />}</WithDrag>
      <ContactShadows />
      <PlaceGhost />
      <MeasureLayer />
      <ClearanceMarks />
      <BoxSelectLayer />
      <ConnectLayer />
      {!isolating && <JunctionLayer />}
      {!isolating && <RouteChips />}
      <WithDrag>{(drag) => <LabelProjector drag={drag} />}</WithDrag>
      {!presenting && <WithDrag>{(drag) => <EditGizmos drag={drag} setDrag={useLiveDrag.getState().setDrag} />}</WithDrag>}
      {firstFrameDrawn && (
        // effects that would not load or broke leave the plain view, never a blank one
        <ErrorBoundary name="View effects" fallback={null}>
          <Suspense fallback={null}>
            <Effects />
          </Suspense>
        </ErrorBoundary>
      )}
      <CameraRig />
      <RedrawOnChange />
      <OrbitSettle />
      <SheetCapture />
      <ViewProbe />
      <ModelExportProbe />
      <OrbitControls
        makeDefault
        target={target}
        maxPolarAngle={Math.PI / 2 - 0.02}
        enableDamping
        autoRotate={presenting && orbit}
        autoRotateSpeed={ORBIT_SPEED}
        // any drag stops the slow orbit
        onStart={() => usePresent.getState().orbit && usePresent.getState().setOrbit(false)}
      />
    </Canvas>
    <ChipLayer />
    <CompassScale />
    <Splash />
    </div>
  )
}
