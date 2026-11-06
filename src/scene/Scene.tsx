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
import { useLiveDrag } from './editing'
import { ContactShadows } from './ContactShadows'
import { lazy, Suspense, useState } from 'react'
import { useSplash } from '../present/viewState'

// AO, tone mapping and anti-aliasing arrive just after the first frame, so the view shows sooner (4E)
const Effects = lazy(() => import('./Effects').then((m) => ({ default: m.Effects })))
import { usePresent, isPresenting } from '../present/present'
import { ViewProbe } from '../present/ViewProbe'
import { CompassScale } from '../present/CompassScale'
import { Splash } from '../present/Splash'
import { NoWebGL } from '../present/NoWebGL'
import { hasWebGL2 } from '../present/webgl'

/** The slow orbit in Present mode, degrees a second at OrbitControls' speed 1 is 6. */
const ORBIT_SPEED = 0.6

export function Scene() {
  const site = usePlanStore((s) => s.site)
  const select = usePlanStore((s) => s.select)
  const drag = useLiveDrag((s) => s.drag)
  const setDrag = useLiveDrag((s) => s.setDrag)
  const target = onGround(site.terrain, 0, 0)
  const [webgl] = useState(() => hasWebGL2())
  const presenting = usePresent((s) => s.presenting)
  const orbit = usePresent((s) => s.orbit)
  const firstFrameDrawn = useSplash((s) => s.ready)
  if (!webgl) return <NoWebGL />
  return (
    <div className="viewport" data-tour="view">
    <LabelLayer />
    <PartHud drag={drag} />
    <PaintHud />
    <Canvas
      shadows="percentage"
      camera={{ position: [target[0] + 32, target[1] + 26, target[2] + 40], fov: 45, near: 0.5, far: 8000 }}
      gl={{ antialias: false, toneMapping: NoToneMapping }}
      // a click on nothing clears the selection, but not the click that ends a box select
      onPointerMissed={() => !boxJustEnded() && !isPresenting() && select([])}
    >
      <SceneEnvironment />
      <Terrain terrain={site.terrain} />
      <RetainingWalls />
      <ParcelLine parcel={site.parcel} terrain={site.terrain} />
      <SiteMarks parcel={site.parcel} terrain={site.terrain} />
      <PlanObjects drag={drag} />
      <ContactShadows />
      <PlaceGhost />
      <MeasureLayer />
      <ClearanceMarks />
      <BoxSelectLayer />
      <ConnectLayer />
      <JunctionLayer />
      <RouteChips />
      <LabelProjector drag={drag} />
      {!presenting && <EditGizmos drag={drag} setDrag={setDrag} />}
      {firstFrameDrawn && (
        <Suspense fallback={null}>
          <Effects />
        </Suspense>
      )}
      <CameraRig />
      <SheetCapture />
      <ViewProbe />
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
