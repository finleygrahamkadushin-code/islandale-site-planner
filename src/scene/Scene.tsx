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
import { Effects } from './Effects'
import { CameraRig } from './CameraRig'
import { SheetCapture } from '../export/sheets/elevation/ElevationCapture'
import { PartHud } from '../buildings/parts/PartHud'
import { PaintHud } from '../buildings/paint/PaintHud'
import { ChipLayer } from './ChipLayer'
import { PlaceGhost } from './PlaceGhost'
import { ConnectLayer } from '../paths/connect/ConnectLayer'
import { JunctionLayer } from '../paths/junctions/JunctionLayer'
import { RouteChips } from '../paths/route/RouteChips'
import { NoToneMapping } from 'three'
import { onGround } from './frame'
import { useLiveDrag } from './editing'

export function Scene() {
  const site = usePlanStore((s) => s.site)
  const select = usePlanStore((s) => s.select)
  const drag = useLiveDrag((s) => s.drag)
  const setDrag = useLiveDrag((s) => s.setDrag)
  const target = onGround(site.terrain, 0, 0)
  return (
    <div className="viewport">
    <LabelLayer />
    <PartHud drag={drag} />
    <PaintHud />
    <Canvas
      shadows="percentage"
      camera={{ position: [target[0] + 32, target[1] + 26, target[2] + 40], fov: 45, near: 0.5, far: 8000 }}
      gl={{ antialias: false, toneMapping: NoToneMapping }}
      onPointerMissed={() => select([])}
    >
      <SceneEnvironment />
      <Terrain terrain={site.terrain} />
      <RetainingWalls />
      <ParcelLine parcel={site.parcel} terrain={site.terrain} />
      <SiteMarks parcel={site.parcel} terrain={site.terrain} />
      <PlanObjects drag={drag} />
      <PlaceGhost />
      <ConnectLayer />
      <JunctionLayer />
      <RouteChips />
      <LabelProjector drag={drag} />
      <EditGizmos drag={drag} setDrag={setDrag} />
      <Effects />
      <CameraRig />
      <SheetCapture />
      <OrbitControls makeDefault target={target} maxPolarAngle={Math.PI / 2 - 0.02} enableDamping />
    </Canvas>
    <ChipLayer />
    </div>
  )
}
