import { useEffect, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { shoreBufferLine } from './buffer'
import type { IsoSegment } from './contours'
import { siteContours } from './siteContours'
import { elevationAt } from './terrain'
import type { Parcel, Terrain } from './types'
import { contoursShown, usePlanStore } from '../store/planStore'
import { toScene } from '../scene/frame'
import { useDisplayStyle } from '../scene/useDisplayStyle'
import { useEarthworks } from './earthworks/useEarthworks'

const LIFT_M = 0.06
const STAKE_M = 2.4
const BUFFER_LIFT_M = 0.12
/** Legacy lot-stake orange. */
export const STAKE = '#d1581e'
/** The shoreline buffer line (follows the setbacks; hidden with the Setbacks layer). */
export const BUFFER = '#c4b97b'

/** Contour lines every 2 ft (darker every 10 ft; siteContours), lot-corner stakes and the shoreline buffer line. */
export function SiteMarks({ terrain, parcel }: { readonly terrain: Terrain; readonly parcel: Parcel }) {
  const style = useDisplayStyle()
  const showContours = usePlanStore(contoursShown)
  const { shoreFt, bankFt, shown: setbacksShown } = usePlanStore((s) => s.setbacks)
  const { works, ground } = useEarthworks()
  const contours = useMemo(() => {
    const lines = siteContours(terrain, works, ground)
    const atLevel = (segs: readonly IsoSegment[], z: number) => segs.flatMap(([x1, n1, x2, n2]) => [...toScene(x1, n1, z + LIFT_M), ...toScene(x2, n2, z + LIFT_M)])
    return {
      minor: lineGeometry(lines.filter((l) => !l.index).flatMap((l) => atLevel(l.segments, l.z))),
      index: lineGeometry(lines.filter((l) => l.index).flatMap((l) => atLevel(l.segments, l.z))),
    }
  }, [terrain, works, ground])
  const buffer = useMemo(
    () => lineGeometry(shoreBufferLine(parcel, shoreFt, bankFt).flatMap(([x1, n1, x2, n2]) => [...toScene(x1, n1, elevationAt(terrain, x1, n1) + BUFFER_LIFT_M), ...toScene(x2, n2, elevationAt(terrain, x2, n2) + BUFFER_LIFT_M)])),
    [parcel, terrain, shoreFt, bankFt],
  )
  useEffect(() => () => [contours.minor, contours.index].forEach((g) => g.dispose()), [contours])
  useEffect(() => () => buffer.dispose(), [buffer])
  const ink = style === 'realistic' ? '#3e4e3a' : '#4a4a46'
  const stakes = parcel.ring.filter((_, i) => !(i > parcel.shorelineEdges.first && i <= parcel.shorelineEdges.last))
  return (
    <group name="site-marks">
      {showContours && (
        <>
          <lineSegments geometry={contours.minor}>
            <lineBasicMaterial color={ink} transparent opacity={0.35} depthWrite={false} />
          </lineSegments>
          <lineSegments geometry={contours.index}>
            <lineBasicMaterial color={ink} transparent opacity={0.75} depthWrite={false} />
          </lineSegments>
        </>
      )}
      {setbacksShown && (
        <lineSegments geometry={buffer}>
          <lineBasicMaterial color={BUFFER} transparent opacity={0.9} depthWrite={false} />
        </lineSegments>
      )}
      {stakes.map(([x, n], i) => (
        <mesh key={i} position={toScene(x, n, ground(x, n) + STAKE_M / 2 - 0.3)} castShadow>
          <cylinderGeometry args={[0.1, 0.1, STAKE_M, 8]} />
          <meshStandardMaterial color={style === 'realistic' ? STAKE : '#bdbab2'} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function lineGeometry(positions: number[]): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return g
}
