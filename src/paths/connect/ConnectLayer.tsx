import { useMemo } from 'react'
import { snapTargets, type SnapTarget } from '../targets'
import { usePlanStore } from '../../store/planStore'
import { toScene } from '../../scene/frame'
import { ScreenChip, STOP_EVENTS, LAYER } from '../../scene/ScreenChip'
import { useEarthworks } from '../../scene/useEarthworks'

/** Targets closer than this (m) to one already shown are left out, so a door and the deck edge in front of it show one chip. */
const MERGE_M = 0.6

/**
 * The Connect tool's picks (old connect targets): a chip on every door,
 * free deck edge, stair or ramp foot, path-piece end and driveway edge;
 * click one end, then the other.
 */
export function ConnectLayer() {
  const connecting = usePlanStore((s) => s.connecting)
  const plan = usePlanStore((s) => s.plan)
  const terrain = usePlanStore((s) => s.site.terrain)
  const setConnecting = usePlanStore((s) => s.setConnecting)
  const { ground } = useEarthworks()
  const targets = useMemo(() => {
    if (!connecting) return []
    const all = snapTargets(plan.order.map((id) => plan.objects[id]), terrain, ground, null)
    const kept: SnapTarget[] = []
    for (const t of all) if (!kept.some((k) => Math.hypot(k.x - t.x, k.n - t.n) < MERGE_M)) kept.push(t)
    return kept
  }, [connecting, plan, terrain, ground])
  if (!connecting) return null
  const pick = (t: SnapTarget) => {
    if (!connecting.A) setConnecting({ ...connecting, A: t })
    else if (!connecting.B && t !== connecting.A) setConnecting({ ...connecting, B: t })
  }
  return (
    <>
      {targets.map((t, i) => {
        const on = t === connecting.A || t === connecting.B
        return (
          <ScreenChip key={i} position={toScene(t.x, t.n, t.z + 0.1)} layer={LAYER.plus}>
            <button type="button" className={`connect-chip${on ? ' on' : ''}`} title={t.label} data-testid={`connect-target-${i}`} data-label={t.label} {...STOP_EVENTS} onClick={() => pick(t)}>
              {on ? (t === connecting.A ? 'A' : 'B') : '●'}
            </button>
          </ScreenChip>
        )
      })}
    </>
  )
}
