import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { usePlanStore } from '../store/planStore'
import { Terrain } from './Terrain'
import { ParcelLine } from './ParcelLine'
import { SiteMarks } from './SiteMarks'
import { PlanObjects } from './PlanObjects'
import { LabelLayer } from './LabelLayer'
import { LabelProjector } from './LabelProjector'
import { EditGizmos } from './EditGizmos'
import { SceneEnvironment } from './SceneEnvironment'
import { Effects } from './Effects'
import { CameraRig } from './CameraRig'
import { NoToneMapping } from 'three'
import { onGround } from './frame'
import type { DragState } from './editing'

export function Scene() {
  const site = usePlanStore((s) => s.site)
  const select = usePlanStore((s) => s.select)
  const [drag, setDrag] = useState<DragState | null>(null)
  const target = onGround(site.terrain, 0, 0)
  return (
    <div className="viewport">
    <LabelLayer />
    <Canvas
      shadows="percentage"
      camera={{ position: [target[0] + 32, target[1] + 26, target[2] + 40], fov: 45, near: 0.5, far: 8000 }}
      gl={{ antialias: false, toneMapping: NoToneMapping }}
      onPointerMissed={() => select([])}
    >
      <SceneEnvironment />
      <Terrain terrain={site.terrain} />
      <ParcelLine parcel={site.parcel} terrain={site.terrain} />
      <SiteMarks parcel={site.parcel} terrain={site.terrain} />
      <PlanObjects drag={drag} />
      <LabelProjector drag={drag} />
      <EditGizmos drag={drag} setDrag={setDrag} />
      <Effects />
      <CameraRig />
      <OrbitControls makeDefault target={target} maxPolarAngle={Math.PI / 2 - 0.02} enableDamping />
    </Canvas>
    </div>
  )
}
