import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import type { Parcel, Terrain } from './types'
import { isShorelineEdge } from './parcel'
import { onGround } from '../scene/frame'

/**
 * The lot line, and its edges along the water. Magenta, the colour property
 * lines are drawn in, so it reads on the green ground, the white model, the
 * sketch paper and the diagram alike (R9.6; it was near-white, lost on the
 * white model).
 */
export const PARCEL_LINE = '#c2185b'
export const SHORELINE_LINE = '#5fb3e6'

const LIFT_M = 0.15
/** Points per edge so the line follows the ground. */
const STEPS = 6

/** The lot line draped on the terrain; shoreline edges in blue, the rest in magenta. */
export function ParcelLine({ parcel, terrain }: { readonly parcel: Parcel; readonly terrain: Terrain }) {
  const { shore, land } = useMemo(() => {
    const shore: [number, number, number][][] = []
    const land: [number, number, number][][] = []
    parcel.ring.forEach(([x1, n1], i) => {
      const [x2, n2] = parcel.ring[(i + 1) % parcel.ring.length]
      const pts: [number, number, number][] = []
      for (let s = 0; s <= STEPS; s++) {
        const f = s / STEPS
        pts.push(onGround(terrain, x1 + (x2 - x1) * f, n1 + (n2 - n1) * f, LIFT_M))
      }
      ;(isShorelineEdge(parcel, i) ? shore : land).push(pts)
    })
    return { shore, land }
  }, [parcel, terrain])

  return (
    <group name="parcel">
      {land.map((pts, i) => (
        <Line key={`l${i}`} points={pts} color={PARCEL_LINE} lineWidth={2.5} />
      ))}
      {shore.map((pts, i) => (
        <Line key={`s${i}`} points={pts} color={SHORELINE_LINE} lineWidth={3} />
      ))}
    </group>
  )
}
