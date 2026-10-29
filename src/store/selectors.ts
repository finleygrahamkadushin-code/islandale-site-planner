import type { PlanState } from './planStore'
import { layerOf, type ObjectId } from './types'

/** Read-only questions about the plan store's state, re-exported from planStore. */

/** Locked by its own padlock or by its layer's padlock. */
export function isObjectLocked(s: Pick<PlanState, 'plan' | 'layers'>, id: ObjectId): boolean {
  const o = s.plan.objects[id]
  if (!o) return false
  return o.locked || s.layers[layerOf(o)].locked
}

/** Hidden by itself or by its layer. */
export function isObjectVisible(s: Pick<PlanState, 'plan' | 'layers'>, id: ObjectId): boolean {
  const o = s.plan.objects[id]
  if (!o) return false
  return !o.hidden && s.layers[layerOf(o)].visible
}

/** Whether contour lines show: the explicit setting, else on in every style but Realistic. */
export function contoursShown(s: Pick<PlanState, 'contours' | 'displayStyle'>): boolean {
  return s.contours ?? s.displayStyle !== 'realistic'
}

/** Whether a label should show for this object under the current label mode. */
export function isLabelShown(s: Pick<PlanState, 'plan' | 'layers' | 'labelMode' | 'selection'>, id: ObjectId): boolean {
  const o = s.plan.objects[id]
  if (!o || !o.labelVisible || !s.layers.labels.visible || !isObjectVisible(s, id)) return false
  if (s.labelMode === 'none') return false
  if (s.labelMode === 'selected') return s.selection.includes(id)
  return true
}
