import { usePlanStore } from './planStore'
import { describeSkipped, readSavedText, type ReadResult, type SaveBackend } from './persistence'
import { HOME_REV_KEY, type PlanHome } from './planHome'

/** What the home held when the plan was opened. */
export interface HomeCopy extends ReadResult {
  /** The file's text as read, kept aside when objects had to be left out of it. */
  readonly text: string
  /** The home changed since this browser last read or wrote it: someone else edited it. */
  readonly changedOutside: boolean
}

export interface HomeSync {
  /** Read the home on opening; null when it has no plan yet or cannot be used. */
  readonly open: () => Promise<HomeCopy | null>
  /** Write a save to the home, after it is safe in this browser. */
  readonly push: (text: string) => Promise<void>
  readonly stop: () => void
}

/**
 * Keeps the browser's copy and the plan's home in step. Writes name the
 * revision they were based on; if the home changed in the meantime (Claude
 * edited the file), the home's version is loaded as one undoable step instead
 * of being overwritten, so nothing is lost either way.
 */
export interface HomeSyncOptions {
  /** Keep a copy of the home's text aside before it is replaced; false when it could not be kept. */
  readonly keepAside?: (text: string) => Promise<boolean>
}

export function createHomeSync(home: PlanHome, backend: SaveBackend, { keepAside }: HomeSyncOptions = {}): HomeSync {
  const store = usePlanStore
  let rev: string | null = readRev()
  let lastError = ''
  let pushing: Promise<void> = Promise.resolve()

  function readRev(): string | null {
    try {
      return backend.readSync(HOME_REV_KEY)
    } catch {
      return null
    }
  }
  const setRev = (r: string) => {
    rev = r
    try {
      backend.writeSync(HOME_REV_KEY, r)
    } catch (err) {
      console.error('[plan home] could not remember the revision', err)
    }
  }
  const warn = (text: string) => {
    if (text === lastError) return
    lastError = text
    store.getState().showToast(text)
  }

  /** Read the home and parse it; null (with a warning) when it cannot be used. */
  const fetchHome = async (): Promise<(HomeCopy & { rev: string }) | null> => {
    let read
    try {
      read = await home.read()
    } catch (err) {
      console.error('[plan home] read failed', err)
      warn(`Could not reach ${home.label}; saving in this browser only`)
      return null
    }
    if (read.text === null) {
      if (rev === null || rev !== read.rev) setRev(read.rev)
      return null
    }
    try {
      return { ...readSavedText(read.text), text: read.text, changedOutside: rev !== read.rev, rev: read.rev }
    } catch (err) {
      console.error('[plan home] the plan file is unreadable', err)
      warn(`${home.label} could not be read (${err instanceof Error ? err.message : 'unknown error'}); it is left as it is`)
      return null
    }
  }

  /** Someone else changed the home: bring their version in as one undoable step. */
  const adoptHome = async () => {
    if (store.getState().readOnly) return
    const copy = await fetchHome()
    if (!copy || !copy.changedOutside) return
    if (copy.newer) {
      // keep the old revision, so no save from this planner can replace the newer file
      store.getState().setReadOnly('newer-file')
      warn(`${home.label} was saved by a newer planner; it was not loaded, and this tab is read-only`)
      return
    }
    // objects that could not be read would be lost by the next save to the home: keep the file as it was first
    if (copy.skipped.length && keepAside && !(await keepAside(copy.text))) return
    setRev(copy.rev)
    store.getState().replacePlan(copy.file.plan)
    const left = copy.skipped.length ? ` ${describeSkipped(copy.skipped)}; the file as it was is kept in History.` : ''
    store.getState().showToast(`Loaded the plan from ${home.label}. Undo to go back.${left}`)
  }

  const pushNow = async (text: string) => {
    if (rev === null) {
      const copy = await fetchHome()
      if (copy) return // a plan file appeared that this browser has never seen: open() decides
    }
    let result
    try {
      result = await home.write(text, rev ?? 'none')
    } catch (err) {
      console.error('[plan home] write failed', err)
      warn(`Saved in this browser, but not to ${home.label}`)
      return
    }
    if (result.ok) {
      lastError = ''
      setRev(result.rev)
      return
    }
    if (result.conflict) await adoptHome()
    else warn(`Saved in this browser, but not to ${home.label}: ${result.error}`)
  }

  // a change from elsewhere waits behind any save in flight, so the app never mistakes its own write for someone else's
  const offChange = home.onChange(() => {
    pushing = pushing.then(adoptHome)
  })

  return {
    open: async () => {
      const copy = await fetchHome()
      // a read-only tab only looks; the editing tab decides which revision this browser's copy is based on
      if (copy && !store.getState().readOnly) setRev(copy.rev)
      return copy
    },
    push: (text) => {
      // one write at a time, so each names the revision the previous one made
      pushing = pushing.then(() => pushNow(text))
      return pushing
    },
    stop: offChange,
  }
}
