import { usePlanStore } from '../../store/planStore'
import type { Plan, PlanObject } from '../../store/types'
import { useConfirm } from '../../guide/confirm'

/**
 * Opening a scheme (5F): ask first, then load it as one undo step, frame the
 * camera on its cabins (the Overview view centres on them), select the
 * gathering building and say what opened. Used by the archive cards and the
 * top bar's Scheme list. Nothing new in the store: it calls `loadScheme`,
 * `select`, `requestView` and `showToast`.
 */

/** The building a newly opened scheme selects: the one named for gathering, else its first cabin. */
export function gatheringBuilding(plan: Plan): PlanObject | null {
  const houses = plan.order.map((id) => plan.objects[id]).filter((o): o is PlanObject => !!o && o.type === 'house' && !o.hidden)
  return houses.find((o) => /gathering/i.test(o.name)) ?? houses[0] ?? null
}

/** What the message says once a scheme opens. */
export function openedText(name: string, rulesOff: boolean): string {
  return rulesOff ? `Opened ${name}. Rules off: not checked against the brief.` : `Opened ${name}`
}

/** Load a scheme now (no question): frame it, select its gathering building and say so. False when the plan can't be replaced. */
export function openSchemeNow(schemeId: string): boolean {
  const s = usePlanStore.getState()
  const scheme = s.schemes.find((x) => x.id === schemeId)
  if (!scheme) return false
  const before = s.plan
  s.loadScheme(schemeId)
  const after = usePlanStore.getState()
  if (after.plan === before) return false // read-only (another tab holds the plan)
  const main = gatheringBuilding(after.plan)
  after.select(main ? [main.id] : [])
  after.requestView('overview')
  after.showToast(openedText(scheme.name, scheme.rulesOff))
  return true
}

/** Ask before replacing the plan, then open the scheme. Asks in Beginner and Advanced alike. */
export function openScheme(schemeId: string, beforeOpen?: () => void): void {
  const scheme = usePlanStore.getState().schemes.find((x) => x.id === schemeId)
  if (!scheme) return
  useConfirm.getState().request(
    { title: `Open ${scheme.name}?`, body: 'This replaces your plan. You can undo this.', confirmLabel: 'Open' },
    () => {
      beforeOpen?.()
      openSchemeNow(schemeId)
    },
  )
}
