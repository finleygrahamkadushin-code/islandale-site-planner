import { useMemo } from 'react'
import { partEdges } from '../parts/attach'
import { removePickedRail } from '../parts/partKeys'
import { inGroup, type PartFrame } from '../parts/partFrame'
import { stairSideState } from './railEdits'
import { wingAt } from '../parts/wingEdits'
import { wingHost } from '../stairs/stairWing'
import { pickedPartOf, usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { LAYER, ScreenChip, STOP_EVENTS } from '../../scene/ScreenChip'

/** The chip sits this far out from the rail on screen, past the rail chips. */
const PICK_PX = 46
const LIFT_M = 0.9

/**
 * The rail picked by a click in 3D (deliberate addition, PLAN.md): a chip
 * on it to remove that one rail (Delete does the same), and on a stair or
 * ramp handrail a Join toggle that carries it over the landing to the
 * railing at the top. Each is one undo step and respects locks.
 */
export function RailPickChip({ o, frame }: { readonly o: PlanObject; readonly frame: PartFrame }) {
  const part = usePlanStore((s) => pickedPartOf(s))
  const pickPart = usePlanStore((s) => s.pickPart)
  const setRailJoin = usePlanStore((s) => s.setRailJoin)
  const mi = part?.objectId === o.id && part.rail !== undefined ? part.mass : null
  const edge = mi === null ? null : (part?.rail ?? null)
  const e = useMemo(() => (mi === null || edge === null ? null : (partEdges(frame.masses, mi, frame.site)[edge] ?? null)), [frame, mi, edge])
  if (mi === null || edge === null || !e) return null
  const m = frame.masses[mi]
  const access = m.kind === 'stair' || m.kind === 'ramp'
  const join = access && o.type === 'house' && wingHost(frame.masses, mi) ? stairSideState(wingAt(o.params, mi), edge).join : null
  return (
    <ScreenChip position={inGroup(frame, e.mid, e.z + LIFT_M)} normal={e.n} px={PICK_PX} layer={LAYER.rail}>
      <div className="rail-pick" data-testid="rail-pick" {...STOP_EVENTS}>
        <button type="button" className="rail-chip bad" data-testid="rail-remove" title="Remove this rail (Delete)" onClick={() => removePickedRail(usePlanStore.getState)}>
          Remove rail
        </button>
        {join !== null && (
          <button
            type="button"
            className={`rail-chip${join ? ' on' : ''}`}
            data-testid="rail-join"
            title="Carry the handrail over the landing to the railing at the top"
            onClick={() => setRailJoin(o.id, mi, edge, !join)}
          >
            {join ? 'Joined' : 'Join'}
          </button>
        )}
        <button type="button" className="rail-chip" title="Back to the part (Esc)" onClick={() => pickPart({ objectId: o.id, mass: mi })}>
          ×
        </button>
      </div>
    </ScreenChip>
  )
}
