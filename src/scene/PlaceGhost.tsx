import { usePlanStore } from '../store/planStore'
import { libraryItem } from '../tools/library'
import { snapPoint } from '../tools/snap'
import { ftToM } from '../site/units'
import { onGround } from './frame'

const GHOST_H_M = 0.3

/** What is being placed, a see-through footprint under the pointer (old placement ghost), on the snap grid when Snap is on; R / Q / E turn it. */
export function PlaceGhost() {
  const placing = usePlanStore((s) => s.placing)
  const snap = usePlanStore((s) => s.snap)
  const terrain = usePlanStore((s) => s.site.terrain)
  if (!placing?.at) return null
  const p = libraryItem(placing.item).params
  const w = ftToM(Number(p.w))
  const d = ftToM(Number(p.d))
  const at = snap ? snapPoint(placing.at) : placing.at
  return (
    <mesh position={onGround(terrain, at.x, at.n, GHOST_H_M / 2)} rotation={[0, (placing.rotation * Math.PI) / 180, 0]} raycast={() => null}>
      <boxGeometry args={[w, GHOST_H_M, d]} />
      <meshBasicMaterial color="#d1581e" transparent opacity={0.45} depthWrite={false} />
    </mesh>
  )
}
