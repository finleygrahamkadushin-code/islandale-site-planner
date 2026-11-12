import { pieceEnds } from '../pieces'
import { useRouteReport } from './RoutePanels'
import { usePlanStore } from '../../store/planStore'
import { toScene } from '../../scene/frame'
import { LAYER, ScreenChip } from '../../scene/ScreenChip'
import { useEarthworks } from '../../site/earthworks/useEarthworks'
import { useWarningChipsShown } from '../../guide/hides'

/** A chip over each path piece that fails the accessible-route check, with its first issue (old failing-piece chips). Advanced only, never in Present (R9.7). */
export function RouteChips() {
  return useWarningChipsShown() ? <FailingRouteChips /> : null
}

function FailingRouteChips() {
  const rep = useRouteReport()
  const plan = usePlanStore((s) => s.plan)
  const { ground } = useEarthworks()
  return (
    <>
      {[...rep.pieces].map(([id, v]) => {
        const o = plan.objects[id]
        if (!o || v.ok || !v.issues.length) return null
        // from the route item's ends, so a bridge's chip sits on the bridge
        const it = rep.graph.items.find((p) => p.id === id)
        const [a, b] = it ? it.ends : (() => {
          const E = pieceEnds(o, ground)
          return [{ x: E.A[0], n: E.A[1], z: E.zA }, { x: E.B[0], n: E.B[1], z: E.zB }] as const
        })()
        return (
          <ScreenChip key={id} position={toScene((a.x + b.x) / 2, (a.n + b.n) / 2, Math.max(a.z, b.z) + 0.6)} layer={LAYER.rail}>
            <span className="step-chip" data-testid="route-chip">
              {v.issues[0].short}
            </span>
          </ScreenChip>
        )
      })}
    </>
  )
}
