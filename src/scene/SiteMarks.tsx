import { useEffect, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { SHORE_BUFFER_FT, shoreBufferLine } from '../site/buffer'
import { terrainContours, type IsoSegment } from '../site/contours'
import { elevationAt } from '../site/terrain'
import type { Parcel, Terrain } from '../site/types'
import { ftToM } from '../site/units'
import { contoursShown, usePlanStore } from '../store/planStore'
import { toScene } from './frame'
import { useDisplayStyle } from './useDisplayStyle'

const CONTOUR_STEP_FT = 2
const LIFT_M = 0.06
const STAKE_M = 2.4
/** Legacy lot-stake orange. */
const STAKE = '#d1581e'
const BUFFER = '#c4b97b'

/** Contour lines every 2 ft (darker every 10 ft), lot-corner stakes and the shoreline buffer line. */
export function SiteMarks({ terrain, parcel }: { readonly terrain: Terrain; readonly parcel: Parcel }) {
  const style = useDisplayStyle()
  const showContours = usePlanStore(contoursShown)
  const contours = useMemo(() => {
    const lines = terrainContours(terrain, ftToM(CONTOUR_STEP_FT))
    const atLevel = (segs: IsoSegment[], z: number) => segs.flatMap(([x1, n1, x2, n2]) => [...toScene(x1, n1, z + LIFT_M), ...toScene(x2, n2, z + LIFT_M)])
    return {
      minor: lineGeometry(lines.filter((l) => !l.index).flatMap((l) => atLevel([...l.segments], l.z))),
      index: lineGeometry(lines.filter((l) => l.index).flatMap((l) => atLevel([...l.segments], l.z))),
    }
  }, [terrain])
  const buffer = useMemo(
    () => lineGeometry(shoreBufferLine(parcel, ftToM(SHORE_BUFFER_FT)).flatMap(([x1, n1, x2, n2]) => [...toScene(x1, n1, elevationAt(terrain, x1, n1) + 0.12), ...toScene(x2, n2, elevationAt(terrain, x2, n2) + 0.12)])),
    [parcel, terrain],
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
      <lineSegments geometry={buffer}>
        <lineBasicMaterial color={BUFFER} transparent opacity={0.9} depthWrite={false} />
      </lineSegments>
      {stakes.map(([x, n], i) => (
        <mesh key={i} position={toScene(x, n, elevationAt(terrain, x, n) + STAKE_M / 2 - 0.3)} castShadow>
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
