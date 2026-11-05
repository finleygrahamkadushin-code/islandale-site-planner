import { useEffect, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { SHORE_BUFFER_FT, shoreBufferLine } from './buffer'
import { contourLevels, isoSegments, terrainContours, type IsoSegment } from './contours'
import { PATCH_SPACING_M, type CellRect } from './earthworks/earthworks'
import { terrainBounds } from './terrain'
import { elevationAt } from './terrain'
import type { Parcel, Terrain } from './types'
import { ftToM } from './units'
import { contoursShown, usePlanStore } from '../store/planStore'
import { toScene } from '../scene/frame'
import { useDisplayStyle } from '../scene/useDisplayStyle'
import { useEarthworks } from './earthworks/useEarthworks'

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
  const { works, ground } = useEarthworks()
  const contours = useMemo(() => {
    const step = ftToM(CONTOUR_STEP_FT)
    // one rect per earthworks patch (objects whose reach overlaps share one), so no contour is drawn twice
    const rects = works.fields.map((f) => f.rect)
    // survey contours outside the cuts, and contours of the cut ground inside them
    const inCut = ([x1, n1, x2, n2]: IsoSegment) => rects.some((r) => inside(terrain, r, (x1 + x2) / 2, (n1 + n2) / 2))
    const lines = terrainContours(terrain, step).map((l) => ({ ...l, segments: l.segments.filter((g) => !inCut(g)) }))
    const b = terrainBounds(terrain)
    for (const r of rects) {
      const x0 = terrain.x0 + r.c0 * terrain.spacing
      const n0 = terrain.n0 + r.r0 * terrain.spacing
      const k = Math.round(terrain.spacing / PATCH_SPACING_M)
      const field = { nx: (r.c1 - r.c0) * k + 1, ny: (r.r1 - r.r0) * k + 1, x0, n0, spacing: PATCH_SPACING_M, at: (i: number, j: number) => ground(x0 + i * PATCH_SPACING_M, n0 + j * PATCH_SPACING_M) }
      contourLevels(b.minZ - 3, b.maxZ, step).forEach((l) => lines.push({ ...l, segments: isoSegments(field, l.z) }))
    }
    const atLevel = (segs: readonly IsoSegment[], z: number) => segs.flatMap(([x1, n1, x2, n2]) => [...toScene(x1, n1, z + LIFT_M), ...toScene(x2, n2, z + LIFT_M)])
    return {
      minor: lineGeometry(lines.filter((l) => !l.index).flatMap((l) => atLevel(l.segments, l.z))),
      index: lineGeometry(lines.filter((l) => l.index).flatMap((l) => atLevel(l.segments, l.z))),
    }
  }, [terrain, works, ground])
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
        <mesh key={i} position={toScene(x, n, ground(x, n) + STAKE_M / 2 - 0.3)} castShadow>
          <cylinderGeometry args={[0.1, 0.1, STAKE_M, 8]} />
          <meshStandardMaterial color={style === 'realistic' ? STAKE : '#bdbab2'} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function inside(t: Terrain, r: CellRect, x: number, n: number): boolean {
  const col = (x - t.x0) / t.spacing
  const row = (n - t.n0) / t.spacing
  return col >= r.c0 && col <= r.c1 && row >= r.r0 && row <= r.r1
}

function lineGeometry(positions: number[]): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return g
}
