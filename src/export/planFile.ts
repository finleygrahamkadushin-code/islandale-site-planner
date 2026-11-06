import { usePlanStore } from '../store/planStore'
import { parsePlanFile, serializePlan, type PlanFile } from '../store/persistence'
import { viewOf } from '../store/autosave'

/** Offer the current plan as a JSON download. */
export function downloadPlanFile(): void {
  const s = usePlanStore.getState()
  const text = serializePlan(s.plan, viewOf(s))
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName(s.plan.name)}.islandale.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function readPlanFile(file: File): Promise<PlanFile> {
  return parsePlanFile(await file.text())
}

/** Replace the current plan with one from a file; one undo step. */
export async function importPlanFile(file: File): Promise<void> {
  const s = usePlanStore.getState()
  try {
    const parsed = await readPlanFile(file)
    s.replacePlan(parsed.plan)
    s.setLabelMode(parsed.view.labelMode)
    for (const [id, layer] of Object.entries(parsed.view.layers)) s.setLayer(id as keyof typeof parsed.view.layers, layer)
    if (parsed.view.environment) s.setEnvironment(parsed.view.environment)
    if (parsed.view.setbacks) s.setSetbacks(parsed.view.setbacks)
    if (parsed.view.displayStyle) s.setDisplayStyle(parsed.view.displayStyle)
    s.showToast(`Loaded ${parsed.plan.name}`)
  } catch (err) {
    s.showToast(`Could not import: ${err instanceof Error ? err.message : 'unknown error'}`)
  }
}

const safeName = (name: string): string => name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'plan'
