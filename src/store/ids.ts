import type { ObjectId, Plan, PlanObject } from './types'

/** Ids and names for new plan objects, shared by the path tools, the place tool and duplicate. */

const objectsOf = (plan: Plan): PlanObject[] => plan.order.map((id) => plan.objects[id]).filter(Boolean)

/** An id not yet in the plan: `<prefix>-<k>`, counting up from the plan's size. */
export function freshId(plan: Plan, prefix: string): ObjectId {
  let k = plan.order.length + 1
  while (plan.objects[`${prefix}-${k}`]) k++
  return `${prefix}-${k}`
}

/** The base name if no object has it yet, else the first free "Name 2", "Name 3", …. */
export function freshName(plan: Plan, base: string): string {
  const stem = base.replace(/\s+\d+$/, '')
  const used = new Set(objectsOf(plan).map((o) => o.name))
  if (!used.has(stem)) return stem
  for (let k = 2; k < 999; k++) if (!used.has(`${stem} ${k}`)) return `${stem} ${k}`
  return stem
}

/** The plan with this object added (at the end of the order) or replaced. */
export function withObjectPut(plan: Plan, o: PlanObject): Plan {
  return { ...plan, objects: { ...plan.objects, [o.id]: o }, order: plan.order.includes(o.id) ? plan.order : [...plan.order, o.id] }
}
