import { pieceEnds } from '../pieces'
import { useRouteReport } from './RoutePanels'
import { usePlanStore } from '../../store/planStore'
import { toScene } from '../../scene/frame'
import { LAYER, ScreenChip } from '../../scene/ScreenChip'
import { useEarthworks } from '../../scene/useEarthworks'

/** A chip over each path piece that fails the accessible-route check, with its first issue (old failing-piece chips). */
export function RouteChips() {
  const rep = useRouteReport()
  const plan = usePlanStore((s) => s.plan)
  const { ground } = useEarthworks()
  return (
    <>
      {[...rep.pieces].map(([id, v]) => {
        const o = plan.objects[id]
        if (!o || v.ok || !v.issues.length) return null
        const E = pieceEnds(o, ground)
        return (
          <ScreenChip key={id} position={toScene((E.A[0] + E.B[0]) / 2, (E.A[1] + E.B[1]) / 2, Math.max(E.zA, E.zB) + 0.6)} layer={LAYER.rail}>
            <span className="step-chip" data-testid="route-chip">
              {v.issues[0].short}
            </span>
          </ScreenChip>
        )
      })}
    </>
  )
}
