import { useLayoutEffect, useMemo, useRef } from 'react'
import { Environment, MeshReflectorMaterial, Sky } from '@react-three/drei'
import type { DirectionalLight } from 'three'
import { sunPosition } from './sun'
import { ringArea } from '../parcel'
import { ftToM } from '../units'
import { usePlanStore } from '../../store/planStore'
import { onGround } from '../../scene/frame'
import { STYLE_BACKGROUND, useDisplayStyle } from '../../scene/useDisplayStyle'
import { useDisplayEffects } from '../../scene/displayOptions'
import { useSunHour } from '../../present/present'
import { skyHour } from '../../present/sunTimeline'
import { useSplash } from '../../present/viewState'
import { ShoreMesh } from './ShoreMesh'
import { skyLook } from './skyLook'

const SUN_DISTANCE_M = 220
const SHADOW_MARGIN_M = 25
const WATER_SIZE_M = 6000

/**
 * Sky, sun, fill light, fog and the tide water. The sun follows the season
 * and hour; the shadow camera is fitted to the lot so shadows stay crisp.
 */
export function SceneEnvironment() {
  const style = useDisplayStyle()
  const { shadows } = useDisplayEffects()
  const site = usePlanStore((s) => s.site)
  const { season, tideFt } = usePlanStore((s) => s.environment)
  // Present's sun animation previews an hour without changing the saved one (4D)
  const hour = useSunHour()
  const light = useRef<DirectionalLight>(null)

  const lot = useMemo(() => {
    const ring = site.parcel.ring
    const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length
    const cn = ring.reduce((a, p) => a + p[1], 0) / ring.length
    const radius = Math.max(...ring.map(([x, n]) => Math.hypot(x - cx, n - cn)))
    return { centre: onGround(site.terrain, cx, cn), radius, area: ringArea(ring) }
  }, [site])

  const sun = sunPosition(season, hour)
  const [dx, dn, up] = sun.direction
  const above = Math.max(up, 0.04)
  const sunVec: [number, number, number] = [dx, above, -dn]
  const [tx, ty, tz] = lot.centre
  const lightPos: [number, number, number] = [tx + dx * SUN_DISTANCE_M, ty + above * SUN_DISTANCE_M, tz - dn * SUN_DISTANCE_M]
  const daylight = sun.elevationDeg > 0 ? Math.sin((sun.elevationDeg * Math.PI) / 180) : 0
  const warm = 1 - Math.min(1, daylight * 2.2)

  useLayoutEffect(() => {
    const l = light.current
    if (!l) return
    const r = lot.radius + SHADOW_MARGIN_M
    const cam = l.shadow.camera
    cam.left = -r
    cam.right = r
    cam.top = r
    cam.bottom = -r
    cam.near = 1
    cam.far = SUN_DISTANCE_M * 2
    cam.updateProjectionMatrix()
    l.target.position.set(tx, ty, tz)
    l.target.updateMatrixWorld()
  }, [lot, tx, ty, tz])

  const realistic = style === 'realistic'
  // Realistic: the fog and background take the sky's horizon colour, warmer as the sun gets low (4E)
  const look = skyLook(sun.elevationDeg)
  const bg = realistic ? look.horizon : STYLE_BACKGROUND[style]
  const sunColour = realistic ? `hsl(${28 + 22 * (1 - warm)}, ${85 * warm + 10}%, ${78 + 17 * (1 - warm)}%)` : '#ffffff'
  const sunIntensity = realistic ? (sun.elevationDeg > 0 ? 1.0 + 1.8 * daylight : 0.25) : style === 'diagram' ? 1.3 : 2.1
  const fill = realistic ? 0.12 + 0.18 * daylight : style === 'diagram' ? 1.7 : 1.75

  return (
    <>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 260, 1400]} />
      {realistic && (
        <>
          <Sky distance={4500} sunPosition={sunVec} turbidity={look.turbidity} rayleigh={look.rayleigh} mieCoefficient={look.mieCoefficient} mieDirectionalG={0.85} />
          <Environment key={`${season}-${skyHour(hour)}`} frames={1} resolution={128} environmentIntensity={0.18 + 0.22 * daylight}>
            <Sky sunPosition={sunVec} turbidity={look.turbidity} rayleigh={look.rayleigh} mieCoefficient={look.mieCoefficient} mieDirectionalG={0.85} />
          </Environment>
        </>
      )}
      <hemisphereLight args={[realistic ? '#cfe0f0' : '#ffffff', realistic ? '#4a4a3c' : '#bdbdb8', fill]} />
      <directionalLight
        ref={light}
        position={lightPos}
        color={sunColour}
        intensity={sunIntensity}
        castShadow={shadows}
        shadow-mapSize={[4096, 4096]}
        shadow-radius={realistic ? 4 : 7}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <Water tideFt={tideFt} style={style} />
      <ShoreMesh />
    </>
  )
}

function Water({ tideFt, style }: { readonly tideFt: number; readonly style: string }) {
  const y = ftToM(tideFt)
  // the reflection renders the scene again every frame: it waits until the first frame is drawn (4E)
  const firstFrameDrawn = useSplash((s) => s.ready)
  if (style === 'realistic' && firstFrameDrawn) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow name="water">
        <planeGeometry args={[WATER_SIZE_M, WATER_SIZE_M]} />
        <MeshReflectorMaterial
          color="#2a4450"
          resolution={1024}
          mirror={0.55}
          blur={[400, 120]}
          mixBlur={0.9}
          mixStrength={2.2}
          depthScale={0}
          roughness={0.35}
          metalness={0.2}
        />
      </mesh>
    )
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} name="water">
      <planeGeometry args={[WATER_SIZE_M, WATER_SIZE_M]} />
      <meshStandardMaterial color={style === 'diagram' ? '#b9d3df' : '#dfe6ea'} roughness={1} />
    </mesh>
  )
}
