import { addedText, attachSpec, doorAddedText, doorCut, type AttachKind } from './attach'
import { num } from '../footprint'
import { usePlanStore } from '../../store/planStore'
import type { ObjectId } from '../../store/types'
import type { PartFrame } from './partFrame'

/**
 * Add a deck, porch, stair, ramp or door off edge i of mass mi (legacy
 * attachAddApply and doorCut), as one undo step, with the old planner's
 * toasts. A new wing becomes the picked part. The frame supplies the
 * ground the stair and ramp runs are sized from.
 */
export function addPartAt(id: ObjectId, frame: PartFrame, mi: number, i: number, kind: AttachKind | 'door'): void {
  const s = usePlanStore.getState()
  const o = s.plan.objects[id]
  const host = frame.masses[mi]
  if (!o || !host) throw new Error(`no mass ${mi} on "${id}"`)
  if (kind === 'door') {
    const r = doorCut(o.params, frame.masses, mi, i)
    if ('reason' in r) return s.showToast(r.reason)
    const before = s.plan
    s.addOpening(id, mi, r.cut)
    if (usePlanStore.getState().plan !== before) s.showToast(doorAddedText(host, mi, i))
    return
  }
  const r = attachSpec(frame.masses, mi, i, kind, frame.site, num(o.params.h, 8))
  if ('reason' in r) return s.showToast(r.reason)
  const added = s.addWing(id, r.wing)
  if (added === null) return
  s.pickPart({ objectId: id, mass: added })
  s.showToast(addedText(kind, r.wing, r.overlaps, host, mi, i))
}
