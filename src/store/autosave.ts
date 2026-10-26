import { usePlanStore, type PlanState } from './planStore'
import { loadFromBrowser, saveToBrowser } from './persistence'

const SAVE_DELAY_MS = 400

/**
 * Restore the autosaved plan (or keep Scheme C when there is none), then save
 * after every change to the plan, label mode or layers. Returns a stop function.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let hydrated = false
  let stopped = false

  const save = async () => {
    const s = usePlanStore.getState()
    s.setSaveStatus('saving')
    try {
      await saveToBrowser(s.plan, viewOf(s))
      if (!stopped) usePlanStore.getState().setSaveStatus('saved')
    } catch (err) {
      console.error('[autosave] save failed', err)
      if (!stopped) {
        usePlanStore.getState().setSaveStatus('error')
        usePlanStore.getState().showToast('Could not save to this browser')
      }
    }
  }
  const schedule = () => {
    if (!hydrated || stopped) return
    usePlanStore.getState().setSaveStatus('unsaved')
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void save(), SAVE_DELAY_MS)
  }

  const unsubscribe = usePlanStore.subscribe((state, prev) => {
    if (
      state.plan !== prev.plan ||
      state.labelMode !== prev.labelMode ||
      state.layers !== prev.layers ||
      state.environment !== prev.environment ||
      state.displayStyle !== prev.displayStyle
    )
      schedule()
  })

  void (async () => {
    try {
      const saved = await loadFromBrowser()
      if (stopped) return
      if (saved) {
        usePlanStore.getState().hydrate({ plan: saved.plan, ...saved.view })
        usePlanStore.temporal.getState().clear()
      }
      usePlanStore.getState().setSaveStatus('saved')
    } catch (err) {
      console.error('[autosave] could not read the saved plan', err)
      usePlanStore.getState().setSaveStatus('error')
      usePlanStore.getState().showToast('The saved plan could not be read; starting from Scheme C')
    } finally {
      hydrated = true
    }
  })()

  return () => {
    stopped = true
    unsubscribe()
    if (timer) clearTimeout(timer)
  }
}

export const viewOf = (s: PlanState) => ({
  labelMode: s.labelMode,
  layers: s.layers,
  environment: s.environment,
  displayStyle: s.displayStyle,
})

