import { usePlanStore, type PlanState } from './planStore'
import {
  AUTOSAVE_KEY,
  SHADOW_KEY,
  UNREADABLE_PREFIX,
  browserBackend,
  describeSkipped,
  readSavedText,
  serializePlan,
  type ReadResult,
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
  /** Saves set aside because they could not be read whole, newest first, so they can be downloaded or opened. */
  readonly setAside: () => Promise<readonly SetAsideCopy[]>
  /** Save what is pending, then stop listening. */
  readonly stop: () => Promise<void>
}

/** A save kept aside, exactly as it was found, so nothing in it is lost. */
export interface SetAsideCopy {
  readonly key: string
  readonly savedAt: string
  readonly text: string
}

interface Options {
  readonly backend?: SaveBackend
  readonly page?: PageEvents
  readonly now?: () => Date
  /** The plan's home (the repo file while the dev server runs); null keeps the plan in this browser only. */
  readonly home?: PlanHome | null
}

interface Candidate extends ReadResult {
  readonly source: 'main' | 'shadow' | 'home'
  /** The text as found, set aside when objects had to be left out of it. */
  readonly text: string
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
  let setAsideCount = 0
  /** Keys set aside by this autosave, for a backend that cannot list its keys. */
  const setAsideHere: string[] = []

  /** Keys of the copies already set aside; empty when the backend cannot list them. */
  const setAsideKeys = async (): Promise<string[]> => {
    const all = backend.keys ? await backend.keys() : setAsideHere
    return [...new Set(all.filter((k) => k.startsWith(UNREADABLE_PREFIX)))]
  }

  /**
   * Keep a save exactly as it was found, under a key nothing else writes, so a
   * later save cannot overwrite what could not be read. The same text is kept
   * once. Gives the key, or null when it could not be kept: editing then goes off.
   */
  const keepAside = async (raw: string): Promise<string | null> => {
    try {
      for (const key of await setAsideKeys()) if ((await backend.read(key)) === raw) return key
      const key = `${UNREADABLE_PREFIX}${now().toISOString()}${setAsideCount++ ? `-${setAsideCount}` : ''}`
      await backend.write(key, raw)
      setAsideHere.push(key)
      return key
    } catch (err) {
      console.error('[autosave] could not keep the unreadable save', err)
      store.getState().setReadOnly('unsafe-save')
      store.getState().showToast('The saved plan could not be read, so editing is off to protect it')
      return null
    }
  }

  const sync = home ? createHomeSync(home, backend, { keepAside: async (text) => (await keepAside(text)) !== null }) : null
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
      state.setbacks !== prev.setbacks ||
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
    console.error('[autosave] could not read the saved plan', err)
    const key = await keepAside(raw)
    if (key) store.getState().showToast(`The saved plan could not be read. It was kept as ${key} (History lists it)`)
  }


  const readCandidates = async (): Promise<Candidate[]> => {
    const found: Candidate[] = []
    const main = await backend.read(AUTOSAVE_KEY)
    if (typeof main === 'string') {
      try {
        found.push({ ...readSavedText(main), source: 'main', text: main })
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
        found.push({ ...readSavedText(shadow), source: 'shadow', text: shadow })
      } catch (err) {
        console.error('[autosave] the closing copy is unreadable; ignoring it', err)
      }
    }
    const fromHome = await sync?.open()
    if (fromHome) found.push({ ...fromHome, source: 'home' })
    // a copy with objects left out is kept whole before anything can be saved over it
    for (const c of found) if (c.skipped.length) await keepAside(c.text)
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
        if (best.skipped.length) store.getState().showToast(`${describeSkipped(best.skipped)}. The save as it was is kept in History.`)
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
    setAside: async () => {
      const keys = await setAsideKeys()
      const copies = await Promise.all(
        keys.map(async (key): Promise<SetAsideCopy | null> => {
          const text = await backend.read(key)
          return typeof text === 'string' ? { key, savedAt: key.slice(UNREADABLE_PREFIX.length).replace(/-\d+$/, ''), text } : null
        }),
      )
      return copies.filter((c): c is SetAsideCopy => c !== null).sort((a, b) => b.key.localeCompare(a.key))
    },
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
  setbacks: s.setbacks,
  displayStyle: s.displayStyle,
  contours: s.contours,
  displayOptions: s.displayOptions,
})
