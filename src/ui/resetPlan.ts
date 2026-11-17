import { currentPlanText } from '../export/planFile'
import { useConfirm } from '../guide/confirm'
import { openSchemeNow } from '../site/archive/openScheme'
import { CURRENT_SCHEME_ID } from '../site/schemes'
import { defaultStore, setHasDefault, type DefaultStore } from '../store/planDefault'
import { describeSkipped, readSavedText } from '../store/persistence'
import { usePlanStore } from '../store/planStore'

/** Replace the plan with the saved default's text, as one undo step. False when it could not be opened. */
export function openDefaultNow(text: string): boolean {
  const s = usePlanStore.getState()
  try {
    const { file, skipped } = readSavedText(text)
    const before = s.plan
    s.replacePlan(file.plan)
    if (usePlanStore.getState().plan === before) return false // read-only: replacePlan's toast says why
    s.applyView(file.view)
    s.requestView('overview')
    s.showToast(skipped.length ? `Opened your default. ${describeSkipped(skipped)}.` : 'Opened your saved default')
    return true
  } catch (err) {
    s.showToast(`Could not open the saved default: ${err instanceof Error ? err.message : 'unknown error'}`)
    return false
  }
}

/** Reset: your saved default when there is one, else the original Scheme C. Asks first; undoable. */
export async function askReset(store: DefaultStore = defaultStore): Promise<void> {
  const text = await store.read()
  setHasDefault(text !== null)
  if (text === null) return askResetOriginal()
  useConfirm.getState().request(
    {
      title: 'Go back to your saved default?',
      body: 'This replaces the current plan with the plan you saved as the default. You can undo this.',
      confirmLabel: 'Reset',
    },
    () => void openDefaultNow(text),
  )
}

/** Reset to the untouched Scheme C from the data, whatever default is saved. Asks first; undoable. */
export function askResetOriginal(): void {
  useConfirm.getState().request(
    { title: 'Go back to Scheme C?', body: 'This replaces the current plan with Scheme C as saved in the old planner. You can undo this.', confirmLabel: 'Reset' },
    () => openSchemeNow(CURRENT_SCHEME_ID),
  )
}

/** Save as default: ask, then write the current plan as the plan file is written. */
export function askSaveDefault(store: DefaultStore = defaultStore): void {
  useConfirm.getState().request(
    {
      title: 'Make this plan the default?',
      body: 'Reset and new starts will open this plan. The original Scheme C stays available under Reset to original Scheme C.',
      confirmLabel: 'Save as default',
    },
    () => {
      const { showToast } = usePlanStore.getState()
      store.write(currentPlanText()).then(
        () => {
          setHasDefault(true)
          showToast('Saved as your default scheme')
        },
        (err) => showToast(`Could not save the default: ${err instanceof Error ? err.message : 'unknown error'}`),
      )
    },
  )
}
