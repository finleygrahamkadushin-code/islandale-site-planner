import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three'
import { usePlanStore } from '../../store/planStore'
import { elevationAt } from '../terrain'
import { ftToM } from '../units'
import { useDisplayStyle } from '../../scene/useDisplayStyle'
import { driftwood, foamSegments, FOAM_LIFT_M } from './shore'
import { sunPosition } from './sun'
import { useSunHour } from '../../present/present'

/** Logs reach this far past the lot's box, metres. */
const DRIFT_MARGIN_M = 40
const FOAM_WIDTH_PX = 2.5
const FOAM_OPACITY = 0.6
/** The foam's gentle wash: how much its opacity swings, and how fast (radians a second). */
const WASH_SWING = 0.25
const WASH_SPEED = 1.1
const LOG_COLOUR: Readonly<Record<string, string>> = { realistic: '#a39886', white: '#f1efe9', sketch: '#ede9df', diagram: '#c8b89c' }

const reducedMotion = (): boolean => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * The shore (4E): a foam line where the water meets the ground at the current
 * tide, and driftwood along the wrack line. Rebuilt only when the tide or the
 * terrain changes.
 */
export function ShoreMesh() {
  const style = useDisplayStyle()
  const terrain = usePlanStore((s) => s.site.terrain)
  const ring = usePlanStore((s) => s.site.parcel.ring)
  const tideFt = usePlanStore((s) => s.environment.tideFt)
  const season = usePlanStore((s) => s.environment.season)
  // the foam line takes no light of its own: it dims with the daylight so it never glows at dusk
  const daylight = Math.max(0, Math.sin((sunPosition(season, useSunHour()).elevationDeg * Math.PI) / 180))
  const foamShade = Math.round(150 + 105 * Math.min(1, daylight * 2.5))
  const foamColour = `rgb(${foamShade}, ${foamShade}, ${Math.min(255, foamShade + 6)})`

  const foam = useMemo(() => {
    const y = ftToM(tideFt) + FOAM_LIFT_M
    return foamSegments(terrain, tideFt).flatMap(([ax, an, bx, bn]) => [new Vector3(ax, y, -an), new Vector3(bx, y, -bn)])
  }, [terrain, tideFt])

  const logs = useMemo(() => {
    const xs = ring.map((p) => p[0])
    const ns = ring.map((p) => p[1])
    return driftwood(terrain, {
      x0: Math.min(...xs) - DRIFT_MARGIN_M,
      x1: Math.max(...xs) + DRIFT_MARGIN_M,
      n0: Math.min(...ns) - DRIFT_MARGIN_M,
      n1: Math.max(...ns) + DRIFT_MARGIN_M,
    })
  }, [terrain, ring])

  const logMesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = logMesh.current
    if (!mesh) return
    const m = new Matrix4()
    const q = new Quaternion()
    const lie = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
    logs.forEach((log, i) => {
      q.setFromAxisAngle(new Vector3(0, 1, 0), log.yaw).multiply(lie)
      m.compose(new Vector3(log.x, elevationAt(terrain, log.x, log.n) + log.radiusM * 0.6, -log.n), q, new Vector3(log.radiusM, log.lengthM, log.radiusM))
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [logs, terrain])

  const foamLine = useRef<{ material: { opacity: number } } | null>(null)
  const still = reducedMotion()
  useFrame(({ clock }) => {
    if (still || !foamLine.current) return
    foamLine.current.material.opacity = FOAM_OPACITY + WASH_SWING * Math.sin(clock.elapsedTime * WASH_SPEED)
  })

  return (
    <group name="shore">
      {foam.length > 0 && (
        <Line
          ref={foamLine as never}
          name="foam"
          points={foam}
          segments
          color={style === 'realistic' ? foamColour : '#ffffff'}
          lineWidth={FOAM_WIDTH_PX}
          transparent
          opacity={FOAM_OPACITY}
          depthWrite={false}
          raycast={() => null}
        />
      )}
      {logs.length > 0 && (
        <instancedMesh ref={logMesh} name="driftwood" args={[undefined, undefined, logs.length]} castShadow receiveShadow raycast={() => null}>
          <cylinderGeometry args={[1, 0.85, 1, 7]} />
          <meshStandardMaterial color={LOG_COLOUR[style] ?? LOG_COLOUR.realistic} roughness={0.95} />
        </instancedMesh>
      )}
    </group>
  )
}
