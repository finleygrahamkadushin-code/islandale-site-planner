import { useMemo } from 'react'
import { BoxGeometry, CylinderGeometry, type BufferGeometry } from 'three'
import { localToSite } from '../buildings/footprint'
import { DRAPE_LIFT_M } from '../site/drape'
import { CAR, carPose, carSlots, type CarPose } from '../site/siteObjects'
import type { DisplayStyle, PlanObject } from '../store/types'
import type { MeshHandlers } from './buildingLook'
import { heightM } from './placement'
import { Surface } from './Surface'
import { useDisplayStyle } from './useDisplayStyle'
import { useEarthworks } from './useEarthworks'

const FT = 0.3048
const BODY_COLOUR = '#6f7681'
const TYRE_COLOUR = '#2f3336'

// shared by every car, never disposed
const BODY: BufferGeometry = new BoxGeometry(CAR.body.w, CAR.body.h, CAR.body.l)
const CABIN: BufferGeometry = new BoxGeometry(CAR.cabin.w, CAR.cabin.h, CAR.cabin.l)
const WHEEL: BufferGeometry = new CylinderGeometry(CAR.wheel.r, CAR.wheel.r, CAR.wheel.t, 12)
const WHEELS: readonly (readonly [number, number])[] = [[-1, 1], [1, 1], [-1, -1], [1, -1]]

interface ParkedCarsProps {
  /** The parking pad, drawn in its own frame (a group at its base, turned by its rotation). */
  readonly o: PlanObject
  /** The pad's base elevation, metres. */
  readonly base: number
  readonly handlers: MeshHandlers
  readonly glow: number
}

/**
 * The cars parked on a pad (legacy makeMesh, `cars`): side by side across
 * its width, each resting on the draped pad under its wheels. A click on a
 * car picks the pad.
 */
export function ParkedCars({ o, base, handlers, glow }: ParkedCarsProps) {
  const { drawnGround } = useEarthworks()
  const style = useDisplayStyle()
  const ribbon = o.params.shape === 'ribbon'
  const slots = useMemo(() => (ribbon ? [] : carSlots(o.params.w, o.params.cars)), [ribbon, o.params.w, o.params.cars])
  const top = heightM(o) + DRAPE_LIFT_M
  const { x, n } = o.position
  const rot = o.rotation
  const poses = useMemo(() => {
    const at = { x, n }
    const topAt = (mx: number, mz: number) => drawnGround(...localToSite(at, rot, [mx / FT, mz / FT])) - base + top
    return slots.map((cx) => carPose(cx, topAt))
  }, [slots, x, n, rot, base, top, drawnGround])
  return (
    <group name="cars">
      {slots.map((cx, i) => (
        <Car key={i} x={cx} pose={poses[i]} style={style} handlers={handlers} glow={glow} />
      ))}
    </group>
  )
}

function Car({ x, pose, style, handlers, glow }: { readonly x: number; readonly pose: CarPose; readonly style: DisplayStyle; readonly handlers: MeshHandlers; readonly glow: number }) {
  return (
    <group position={[x, pose.y, 0]} rotation={[pose.pitch, 0, pose.roll]}>
      <mesh geometry={BODY} position={[0, CAR.body.y, 0]} castShadow receiveShadow {...handlers}>
        <Surface kind="pad" style={style} color={BODY_COLOUR} glow={glow} />
      </mesh>
      <mesh geometry={CABIN} position={[0, CAR.cabin.y, CAR.cabin.z]} castShadow {...handlers}>
        <Surface kind="glass" style={style} />
      </mesh>
      {WHEELS.map(([sx, sz], k) => (
        <mesh key={k} geometry={WHEEL} position={[sx * CAR.wheel.x, CAR.wheel.r, sz * CAR.wheel.z]} rotation={[0, 0, Math.PI / 2]}>
          <Surface kind="trunk" style={style} color={TYRE_COLOUR} />
        </mesh>
      ))}
    </group>
  )
}
