import { useMemo } from 'react'
import { partEdges } from '../buildings/attach'
import { railChipLabel, railChipTitle } from '../buildings/partFields'
import { cycle } from '../buildings/railEdits'
import { isRailable } from '../buildings/railRules'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { inGroup, type PartFrame } from './partFrame'
import { objectRails } from './railSite'
import { LAYER, ScreenChip, STOP_EVENTS } from './ScreenChip'
import { useRailWorld } from './useRailWorld'

/** Rail chips sit this far out from the edge midpoint on screen (legacy RAIL_PX). */
const RAIL_PX = 22
const LIFT_M = 0.15

interface Props {
  readonly o: PlanObject
  readonly frame: PartFrame
  readonly picked: number | null
}

/** The mass whose rails the chips set: a picked deck or porch wing, or a standalone deck itself. */
export function railTargetOf(frame: PartFrame, picked: number | null): number | null {
  if (frame.standalone) return 0
  return picked !== null && picked > 0 && frame.masses[picked] && isRailable(frame.masses[picked]) ? picked : null
}

/**
 * A chip on each free edge of the picked deck or porch (or a selected
 * standalone deck) that cycles its rail auto → on → off (legacy rail-edit
 * chips): accent when a rail is drawn, red when one is required and not.
 */
export function RailChips({ o, frame, picked }: Props) {
  const world = useRailWorld()
  const setRail = usePlanStore((s) => s.setRail)
  const mi = railTargetOf(frame, picked)
  const rails = useMemo(() => (mi === null ? null : objectRails(world, o)[mi]), [world, o, mi])
  if (mi === null || !rails) return null
  const m = frame.masses[mi]
  const E = partEdges(frame.masses, mi, frame.site)
  return (
    <>
      {rails.map((r) => {
        const e = E[r.i]
        if (!r.free || !e) return null
        const bad = r.required && !r.drawn
        return (
          <ScreenChip key={r.i} position={inGroup(frame, e.mid, e.z + LIFT_M)} normal={e.n} px={RAIL_PX} layer={LAYER.rail}>
            <button
              type="button"
              className={`rail-chip${r.drawn ? ' on' : ''}${bad ? ' bad' : ''}`}
              data-testid={`rail-chip-${mi}-${r.i}`}
              title={railChipTitle(m, r)}
              {...STOP_EVENTS}
              onClick={(ev) => {
                ev.stopPropagation()
                setRail(o.id, mi, r.i, cycle(r.state))
              }}
            >
              {railChipLabel(r.state)}
            </button>
          </ScreenChip>
        )
      })}
    </>
  )
}
