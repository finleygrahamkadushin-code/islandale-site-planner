import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { usePlanStore } from '../store/planStore'
import { Terrain } from './Terrain'
import { ParcelLine } from './ParcelLine'
import { PlanObjects } from './PlanObjects'
import { LabelLayer } from './LabelLayer'
import { LabelProjector } from './LabelProjector'
import { EditGizmos } from './EditGizmos'
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
      camera={{ position: [target[0] + 32, target[1] + 26, target[2] + 40], fov: 45, near: 0.5, far: 2000 }}
      gl={{ antialias: true }}
      onPointerMissed={() => select([])}
    >
      <color attach="background" args={['#0f1216']} />
      <hemisphereLight args={['#dfe9f3', '#3b3a33', 0.7]} />
      <directionalLight
        position={[80, 120, 60]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-140}
        shadow-camera-right={140}
        shadow-camera-top={140}
        shadow-camera-bottom={-140}
        shadow-camera-far={400}
      />
      <Terrain terrain={site.terrain} />
      <ParcelLine parcel={site.parcel} terrain={site.terrain} />
      <PlanObjects drag={drag} />
      <LabelProjector drag={drag} />
      <EditGizmos drag={drag} setDrag={setDrag} />
      <OrbitControls makeDefault target={target} maxPolarAngle={Math.PI / 2 - 0.02} enableDamping />
    </Canvas>
    </div>
  )
}
