import type { ObjectId, Plan, PlanObject } from '../store/types'

/**
 * Groups: objects that share a `group` id are picked, moved and isolated
 * together. Groups are flat (one level, no groups inside groups). These are
 * the pure readings and edits; the undoable actions are `groupObjects` and
 * `ungroupObjects` in `../store/toolActions.ts`.
 */

/** Every object in the same group as `id`, in plan order; just `id` when it is ungrouped. */
export function groupMembers(plan: Plan, id: ObjectId): ObjectId[] {
  const group = plan.objects[id]?.group
  if (!group) return plan.objects[id] ? [id] : []
  return plan.order.filter((k) => plan.objects[k]?.group === group)
}

/** The ids with each one's whole group added, in plan order, without repeats. */
export function expandToGroups(plan: Plan, ids: readonly ObjectId[]): ObjectId[] {
  const wanted = new Set(ids.filter((id) => plan.objects[id]))
  const groups = new Set([...wanted].map((id) => plan.objects[id].group).filter((g): g is string => !!g))
  return plan.order.filter((id) => {
    const o = plan.objects[id]
    return !!o && (wanted.has(id) || (o.group !== undefined && groups.has(o.group)))
  })
}

/**
 * What a click or a box on `ids` selects: each one's whole group, except in
 * the group open in isolation (`openGroup`), where members are picked one by one.
 */
export function pickedIds(plan: Plan, ids: readonly ObjectId[], openGroup: string | null): ObjectId[] {
  const singles = ids.filter((id) => openGroup !== null && plan.objects[id]?.group === openGroup)
  const whole = ids.filter((id) => !singles.includes(id))
  const keep = new Set([...singles, ...expandToGroups(plan, whole)])
  return plan.order.filter((id) => keep.has(id))
}

function usedGroups(plan: Plan): Set<string> {
  return new Set(plan.order.map((id) => plan.objects[id]?.group).filter((g): g is string => !!g))
}

function nextFree(used: ReadonlySet<string>): string {
  let k = 1
  while (used.has(`group-${k}`)) k++
  return `group-${k}`
}

/** A group id not yet used in the plan: `group-<k>`. */
export function freshGroupId(plan: Plan): string {
  return nextFree(usedGroups(plan))
}

/** The object without a group. */
export function withoutGroup(o: PlanObject): PlanObject {
  if (o.group === undefined) return o
  const { group: _dropped, ...rest } = o
  return rest
}

/** The plan with each of `ids` given `group`, or ungrouped when `group` is null. */
export function withGroup(plan: Plan, ids: readonly ObjectId[], group: string | null): Plan {
  const objects = { ...plan.objects }
  for (const id of ids) {
    const o = objects[id]
    if (o) objects[id] = group ? { ...o, group } : withoutGroup(o)
  }
  return { ...plan, objects }
}

/**
 * Group ids for copies, keyed by the source's group: a group copied whole
 * gets a fresh id; a copy of part of a group stays in that group (as copying
 * inside an open group does).
 */
export function copyGroupIds(plan: Plan, sources: readonly ObjectId[]): ReadonlyMap<string, string> {
  const picked = new Set(sources)
  const used = usedGroups(plan)
  const map = new Map<string, string>()
  for (const id of sources) {
    const g = plan.objects[id]?.group
    if (!g || map.has(g)) continue
    const whole = groupMembers(plan, id).every((k) => picked.has(k))
    const next = whole ? nextFree(used) : g
    used.add(next)
    map.set(g, next)
  }
  return map
}
