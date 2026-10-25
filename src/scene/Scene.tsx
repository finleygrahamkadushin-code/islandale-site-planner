import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { usePlanStore } from '../store/planStore'
import { Terrain } from './Terrain'
import { ParcelLine } from './ParcelLine'
import { onGround } from './frame'

export function Scene() {
  const site = usePlanStore((s) => s.site)
  const target = onGround(site.terrain, 0, 0)
  return (
    <Canvas
      shadows="percentage"
      camera={{ position: [target[0] + 60, target[1] + 45, target[2] + 70], fov: 45, near: 0.5, far: 2000 }}
      gl={{ antialias: true }}
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
      <OrbitControls target={target} maxPolarAngle={Math.PI / 2 - 0.02} enableDamping />
    </Canvas>
  )
}
