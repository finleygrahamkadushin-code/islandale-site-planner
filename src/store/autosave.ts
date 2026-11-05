import { usePlanStore, type PlanState } from './planStore'
import {
  AUTOSAVE_KEY,
  SHADOW_KEY,
  UNREADABLE_PREFIX,
  browserBackend,
  readSavedText,
  serializePlan,
  type PlanFile,
  type SaveBackend,
} from './persistence'
import { HISTORY_KEY, OPENED_LABEL, addToHistory, describeChange, readHistory, type HistoryEntry } from './history'
import type { Plan } from './types'
import { createHomeSync } from './homeSync'
import type { PlanHome } from './planHome'

export const SAVE_DELAY_MS = 400
const RECOVERED_LABEL = 'opened, with the changes made as the tab closed'

/** The page events autosave listens to; the browser ones come from window and document. */
export interface PageEvents {
  readonly on: (type: 'hidden' | 'pagehide' | 'beforeunload', handler: (e: Event) => void) => () => void
}

export const browserPageEvents: PageEvents = {
  on: (type, handler) => {
    if (type === 'hidden') {
      const f = (e: Event) => {
        if (document.visibilityState === 'hidden') handler(e)
      }
      document.addEventListener('visibilitychange', f)
      return () => document.removeEventListener('visibilitychange', f)
    }
    window.addEventListener(type, handler)
    return () => window.removeEventListener(type, handler)
  },
}

export interface Autosave {
  /** Resolves once the saved plan has been read back. */
  readonly ready: Promise<void>
  /** Save any pending change now. */
  readonly flush: () => Promise<void>
  /** Read the plan back from storage (after another tab hands over editing). */
  readonly reload: () => Promise<void>
  /** The saved copies, newest first, for the History menu. */
  readonly history: () => readonly HistoryEntry[]
  /** Save what is pending, then stop listening. */
  readonly stop: () => Promise<void>
}

interface Options {
  readonly backend?: SaveBackend
  readonly page?: PageEvents
  readonly now?: () => Date
  /** The plan's home (the repo file while the dev server runs); null keeps the plan in this browser only. */
  readonly home?: PlanHome | null
}

interface Candidate {
  readonly file: PlanFile
  readonly newer: boolean
  readonly source: 'main' | 'shadow' | 'home'
  /** Only for the home: it was edited outside this browser, so it wins. */
  readonly changedOutside?: boolean
}

let current: Autosave | null = null
/** The running autosave, for the History menu and the tab lock. */
export const activeAutosave = (): Autosave | null => current

/**
 * Restore the newest saved plan (or keep Scheme C when there is none), then
 * save after every change to the plan or the view, again whenever the tab is
 * hidden or closed, and keep the last saves as history.
 */
export function startAutosave({
  backend = browserBackend,
  page = browserPageEvents,
  now = () => new Date(),
  home = null,
}: Options = {}): Autosave {
  const store = usePlanStore
  const sync = home ? createHomeSync(home, backend) : null
  let timer: ReturnType<typeof setTimeout> | null = null
  let hydrated = false
  let stopped = false
  let dirty = false
  let entries: readonly HistoryEntry[] = []
  let lastPlan: Plan | null = null

  const canSave = () => hydrated && !stopped && !store.getState().readOnly
  const textNow = () => {
    const s = store.getState()
    return serializePlan(s.plan, viewOf(s), now())
  }

  const recordHistory = async (text: string, plan: Plan, force = false, forcedLabel = OPENED_LABEL) => {
    const label = force ? forcedLabel : describeChange(lastPlan, plan)
    lastPlan = plan
    entries = addToHistory(entries, { savedAt: now().toISOString(), label, text }, force)
    await backend.write(HISTORY_KEY, entries)
  }

  const saveNow = async () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!dirty || !canSave()) return
    dirty = false
    const plan = store.getState().plan
    const text = textNow()
    store.getState().setSaveStatus('saving')
    try {
      await backend.write(AUTOSAVE_KEY, text)
      if (!dirty) store.getState().setSaveStatus('saved')
      // the browser copy is safe; now the home
      await sync?.push(text)
    } catch (err) {
      dirty = true
      console.error('[autosave] save failed', err)
      store.getState().setSaveStatus('error')
      store.getState().showToast('Could not save to this browser')
      return
    }
    try {
      await recordHistory(text, plan)
    } catch (err) {
      console.error('[autosave] could not add to history', err)
    }
  }

  const schedule = () => {
    if (!canSave()) return
    dirty = true
    store.getState().setSaveStatus('unsaved')
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void saveNow(), SAVE_DELAY_MS)
  }

  /** The tab is going away: write a synchronous copy first, since IndexedDB may not finish. */
  const onLeave = () => {
    if (!dirty || !canSave()) return
    try {
      backend.writeSync(SHADOW_KEY, textNow())
    } catch (err) {
      console.error('[autosave] could not write the closing copy', err)
    }
    void saveNow()
  }

  const unsubscribe = store.subscribe((state, prev) => {
    if (
      state.plan !== prev.plan ||
      state.labelMode !== prev.labelMode ||
      state.layers !== prev.layers ||
      state.environment !== prev.environment ||
      state.displayStyle !== prev.displayStyle ||
      state.displayOptions !== prev.displayOptions ||
      state.contours !== prev.contours
    )
      schedule()
  })
  const offEvents = [
    page.on('hidden', onLeave),
    page.on('pagehide', onLeave),
    page.on('beforeunload', (e) => {
      // Some browsers (and closing a tab from a script) fire this but not pagehide.
      onLeave()
      if (store.getState().saveStatus !== 'error') return
      e.preventDefault()
      ;(e as unknown as { returnValue: string }).returnValue = ''
    }),
  ]

  /** Set aside a save that could not be read, so the next change cannot overwrite it. */
  const quarantine = async (raw: string, err: unknown) => {
    const key = `${UNREADABLE_PREFIX}${now().toISOString()}`
    console.error('[autosave] could not read the saved plan', err)
    try {
      await backend.write(key, raw)
      store.getState().showToast(`The saved plan could not be read. It was kept as ${key}`)
    } catch (writeErr) {
      console.error('[autosave] could not keep the unreadable save', writeErr)
      store.getState().setReadOnly('unsafe-save')
      store.getState().showToast('The saved plan could not be read, so editing is off to protect it')
    }
  }

  const readCandidates = async (): Promise<Candidate[]> => {
    const found: Candidate[] = []
    const main = await backend.read(AUTOSAVE_KEY)
    if (typeof main === 'string') {
      try {
        found.push({ ...readSavedText(main), source: 'main' })
      } catch (err) {
        await quarantine(main, err)
      }
    }
    let shadow: string | null = null
    try {
      shadow = backend.readSync(SHADOW_KEY)
    } catch (err) {
      console.error('[autosave] could not read the closing copy', err)
    }
    if (shadow) {
      try {
        found.push({ ...readSavedText(shadow), source: 'shadow' })
      } catch (err) {
        console.error('[autosave] the closing copy is unreadable; ignoring it', err)
      }
    }
    const fromHome = await sync?.open()
    if (fromHome) found.push({ ...fromHome, source: 'home' })
    return found
  }

  /** A home edited elsewhere wins; otherwise the newest copy does. */
  const newest = (found: readonly Candidate[]): Candidate | null =>
    found.find((c) => c.changedOutside) ??
    found.reduce<Candidate | null>((a, c) => (!a || Date.parse(c.file.savedAt) > Date.parse(a.file.savedAt) ? c : a), null)

  const load = async () => {
    hydrated = false
    try {
      const [found, storedHistory] = await Promise.all([readCandidates(), backend.read(HISTORY_KEY)])
      if (stopped) return
      entries = readHistory(storedHistory)
      const best = newest(found)
      if (best) {
        store.getState().hydrate({ plan: best.file.plan, ...best.file.view })
        store.temporal.getState().clear()
        if (best.newer) store.getState().setReadOnly('newer-file')
      }
      lastPlan = store.getState().plan
      store.getState().setSaveStatus(store.getState().readOnly ? 'error' : 'saved')
      hydrated = true
      if (store.getState().readOnly) return
      const text = textNow()
      // the home is missing or older than this browser's copy: bring it up to date
      if (best?.source !== 'home') await sync?.push(text)
      if (!best) return
      // the copy written as the tab closed, or the home, is newer than the main save: write it through
      const recovered = best.source === 'shadow'
      if (best.source !== 'main') await backend.write(AUTOSAVE_KEY, text)
      await recordHistory(text, lastPlan, true, recovered ? RECOVERED_LABEL : OPENED_LABEL)
    } catch (err) {
      console.error('[autosave] could not open the saved plan', err)
      store.getState().setReadOnly('unsafe-save')
      store.getState().setSaveStatus('error')
      store.getState().showToast('The saved plan could not be opened, so editing is off to protect it')
      hydrated = true
    }
  }

  const ready = load()

  const api: Autosave = {
    ready,
    flush: async () => {
      await ready
      await saveNow()
    },
    reload: async () => {
      if (timer) clearTimeout(timer)
      dirty = false
      await load()
    },
    history: () => entries,
    stop: async () => {
      await ready
      await saveNow()
      stopped = true
      unsubscribe()
      for (const off of offEvents) off()
      sync?.stop()
      if (current === api) current = null
    },
  }
  current = api
  return api
}

export const viewOf = (s: PlanState) => ({
  labelMode: s.labelMode,
  layers: s.layers,
  environment: s.environment,
  displayStyle: s.displayStyle,
  contours: s.contours,
  displayOptions: s.displayOptions,
})
