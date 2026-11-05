import { useMemo } from 'react'
import { isObjectLocked, usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { AddChips } from './AddChips'
import type { DragState } from '../../scene/editing'
import { toScene } from '../../scene/frame'
import { partFrame } from './partFrame'
import { PartHandles } from './PartHandleMesh'
import { PartOutline } from './PartOutline'
import { RailChips } from '../rails/RailChips'
import { useEarthworks } from '../../site/earthworks/useEarthworks'

interface Props {
  readonly o: PlanObject
  /** The picked part of this object, or null. */
  readonly picked: number | null
  /** A drag is in progress: the chips step aside. */
  readonly dragging: boolean
  readonly setDrag: (d: DragState | null) => void
}

/**
 * Everything drawn over the selected building's parts: the picked part's
 * outline and handles, + chips on free edges, and rail chips, in a group
 * at the building's floor turned with it. Nothing but the outline on a
 * locked building (picking a part to read it stays allowed).
 */
export function PartLayer({ o, picked, dragging, setDrag }: Props) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const locked = usePlanStore((s) => isObjectLocked(s, o.id))
  const { ground } = useEarthworks()
  const frame = useMemo(() => partFrame(o, terrain, ground), [o, terrain, ground])
  if (!frame) return null
  const house = o.type === 'house'
  return (
    <group position={toScene(o.position.x, o.position.n, frame.base)} rotation={[0, (o.rotation * Math.PI) / 180, 0]}>
      {house && picked !== null && <PartOutline frame={frame} mi={picked} />}
      {!locked && house && picked !== null && <PartHandles o={o} mi={picked} frame={frame} setDrag={setDrag} />}
      {!locked && house && !dragging && <AddChips o={o} frame={frame} picked={picked} />}
      {!locked && !dragging && <RailChips o={o} frame={frame} picked={picked} />}
    </group>
  )
}
