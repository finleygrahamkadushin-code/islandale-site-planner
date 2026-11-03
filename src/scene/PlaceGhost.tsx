import { PIECE_LIBRARY } from '../store/pathActions'
import { usePlanStore } from '../store/planStore'
import { ftToM } from '../site/units'
import { onGround } from './frame'

/** The piece being placed, a see-through box under the pointer (old placement ghost); R turns it. */
export function PlaceGhost() {
  const placing = usePlanStore((s) => s.placing)
  const terrain = usePlanStore((s) => s.site.terrain)
  if (!placing?.at) return null
  const p = PIECE_LIBRARY[placing.kind].params
  const w = ftToM(Number(p.w))
  const d = ftToM(Number(p.d))
  return (
    <mesh position={onGround(terrain, placing.at.x, placing.at.n, 0.15)} rotation={[0, (placing.rotation * Math.PI) / 180, 0]} raycast={() => null}>
      <boxGeometry args={[w, 0.3, d]} />
      <meshBasicMaterial color="#d1581e" transparent opacity={0.45} depthWrite={false} />
    </mesh>
  )
}
