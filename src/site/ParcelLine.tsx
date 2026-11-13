import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import type { Parcel, Terrain } from './types'
import { isShorelineEdge } from './parcel'
import { onGround } from '../scene/frame'
import { LAYER, ScreenChip } from '../scene/ScreenChip'
import { usePresent } from '../present/present'
import { HIGH_WATER_LABEL } from './highWater'

/**
 * The lot line, and its edges along the water. Magenta, the colour property
 * lines are drawn in, so it reads on the green ground, the white model, the
 * sketch paper and the diagram alike (R9.6; it was near-white, lost on the
 * white model).
 */
export const PARCEL_LINE = '#c2185b'
export const SHORELINE_LINE = '#5fb3e6'
/** The approximate high-water line the buffer is measured from (item 11): a deeper blue, dashed, inside the lot line at the water. */
export const HIGH_WATER_LINE = '#1d5c85'

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
      <HighWaterLine parcel={parcel} terrain={terrain} />
    </group>
  )
}

/**
 * The approximate high-water line (8 ft NAVD88 contour of the terrain,
 * `highWater.ts`), draped on the ground and named once at its middle; the
 * name leaves while presenting, as the clearance marks do.
 */
function HighWaterLine({ parcel, terrain }: { readonly parcel: Parcel; readonly terrain: Terrain }) {
  const presenting = usePresent((s) => s.presenting)
  const line = useMemo(() => {
    const pts = parcel.highWater?.pts
    if (!pts || pts.length < 2) return null
    const mid = pts[Math.floor(pts.length / 2)]
    return { points: pts.map(([x, n]) => onGround(terrain, x, n, LIFT_M)), mid: onGround(terrain, mid[0], mid[1], LIFT_M) }
  }, [parcel, terrain])
  if (!line) return null
  return (
    <group name="high-water-line">
      <Line points={line.points} color={HIGH_WATER_LINE} lineWidth={2} dashed dashSize={0.6} gapSize={0.3} />
      {!presenting && (
        <ScreenChip position={line.mid} layer={LAYER.label}>
          <div className="measure-label high-water-label" style={{ background: HIGH_WATER_LINE }} data-testid="high-water-label">
            {HIGH_WATER_LABEL}
          </div>
        </ScreenChip>
      )}
    </group>
  )
}
