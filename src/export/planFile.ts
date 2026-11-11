import { usePlanStore } from '../store/planStore'
import { describeSkipped, parsePlanFile, readPlanFileText, serializePlan, type PlanFile } from '../store/persistence'
import { viewOf } from '../store/autosave'

/** The current plan and view as plan-file text, as a download writes it. */
export function currentPlanText(): string {
  const s = usePlanStore.getState()
  return serializePlan(s.plan, viewOf(s))
}

/** Offer the current plan as a JSON download. */
export function downloadPlanFile(): void {
  const s = usePlanStore.getState()
  const text = currentPlanText()
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

/**
 * Replace the current plan with one from a file (one undo step) and take its
 * view settings. A refused plan (a read-only tab) leaves the view alone too.
 */
export async function importPlanFile(file: File): Promise<void> {
  const s = usePlanStore.getState()
  try {
    const { file: parsed, skipped } = readPlanFileText(await file.text())
    const before = usePlanStore.getState().plan
    s.replacePlan(parsed.plan)
    if (usePlanStore.getState().plan === before) return // refused: replacePlan's toast says why
    s.applyView(parsed.view)
    s.showToast(skipped.length ? `Loaded ${parsed.plan.name}. ${describeSkipped(skipped)}.` : `Loaded ${parsed.plan.name}`)
  } catch (err) {
    s.showToast(`Could not import: ${err instanceof Error ? err.message : 'unknown error'}`)
  }
}

const safeName = (name: string): string => name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'plan'
