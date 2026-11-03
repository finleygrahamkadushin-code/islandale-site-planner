import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { startAutosave, type Autosave, type PageEvents } from './autosave'
import { AUTOSAVE_KEY, SHADOW_KEY, UNREADABLE_PREFIX, readSavedText, serializePlan, type SaveBackend } from './persistence'
import { HISTORY_KEY } from './history'
import { usePlanStore } from './planStore'
import { DEFAULT_LAYERS } from './types'
import type { PlanHome } from './planHome'

const store = () => usePlanStore.getState()
const firstId = () => store().plan.order[0]
const view = { labelMode: 'all' as const, layers: DEFAULT_LAYERS }

function fakeBackend(initial: Record<string, unknown> = {}, sync: Record<string, string> = {}) {
  const db = new Map<string, unknown>(Object.entries(initial))
  const ls = new Map<string, string>(Object.entries(sync))
  const backend: SaveBackend = {
    read: async (k) => db.get(k),
    write: async (k, v) => void db.set(k, v),
    readSync: (k) => ls.get(k) ?? null,
    writeSync: (k, v) => void ls.set(k, v),
  }
  return { backend, db, ls }
}

function fakePage() {
  const handlers = new Map<string, ((e: Event) => void)[]>()
  const page: PageEvents = {
    on: (type, h) => {
      handlers.set(type, [...(handlers.get(type) ?? []), h])
      return () => handlers.set(type, (handlers.get(type) ?? []).filter((x) => x !== h))
    },
  }
  const fire = (type: string) => (handlers.get(type) ?? []).forEach((h) => h(new Event(type)))
  return { page, fire }
}

/** Let pending promise callbacks (the fake IndexedDB writes) run. */
const settle = () => new Promise((r) => setTimeout(r, 0))
const savedPlan = (db: Map<string, unknown>) => readSavedText(db.get(AUTOSAVE_KEY) as string).file.plan

describe('autosave', () => {
  let running: Autosave | null = null
  beforeEach(() => {
    store().setReadOnly(null)
    store().loadScheme('C')
    usePlanStore.temporal.getState().clear()
  })
  afterEach(async () => {
    await running?.stop()
    running = null
  })

  test('an edit followed by closing the tab within 400 ms is saved, with a synchronous copy', async () => {
    const { backend, db, ls } = fakeBackend()
    const { page, fire } = fakePage()
    running = startAutosave({ backend, page })
    await running.ready
    store().moveObject(firstId(), { x: 12, n: 34 })
    fire('pagehide')
    expect(readSavedText(ls.get(SHADOW_KEY)!).file.plan.objects[firstId()].position).toEqual({ x: 12, n: 34 })
    await settle()
    expect(savedPlan(db).objects[firstId()].position).toEqual({ x: 12, n: 34 })
    expect(store().saveStatus).toBe('saved')
  })

  test('hiding the tab saves straight away', async () => {
    const { backend, db } = fakeBackend()
    const { page, fire } = fakePage()
    running = startAutosave({ backend, page })
    await running.ready
    store().renameObject(firstId(), 'Hall')
    fire('hidden')
    await settle()
    expect(savedPlan(db).objects[firstId()].name).toBe('Hall')
  })

  test('stopping saves a pending change instead of dropping it', async () => {
    const { backend, db } = fakeBackend()
    running = startAutosave({ backend, page: fakePage().page })
    await running.ready
    store().renameObject(firstId(), 'Kept')
    await running.stop()
    running = null
    expect(savedPlan(db).objects[firstId()].name).toBe('Kept')
  })

  test('a save that cannot be read is set aside and never overwritten', async () => {
    const broken = '{"version":1,"plan":{"broken":true'
    const { backend, db } = fakeBackend({ [AUTOSAVE_KEY]: broken })
    running = startAutosave({ backend, page: fakePage().page })
    await running.ready
    const kept = [...db.keys()].filter((k) => k.startsWith(UNREADABLE_PREFIX))
    expect(kept).toHaveLength(1)
    expect(store().toast?.text).toContain(kept[0])
    store().renameObject(firstId(), 'After')
    await running.flush()
    expect(db.get(kept[0])).toBe(broken)
    expect(savedPlan(db).objects[firstId()].name).toBe('After')
  })

  test('a file from a newer version opens read-only and is not overwritten', async () => {
    const text = serializePlan({ ...store().plan, name: 'From the future' }, view).replace('"version": 1', '"version": 2')
    const { backend, db } = fakeBackend({ [AUTOSAVE_KEY]: text })
    running = startAutosave({ backend, page: fakePage().page })
    await running.ready
    expect(store().plan.name).toBe('From the future')
    expect(store().readOnly).toBe('newer-file')
    const before = store().plan
    store().moveObject(firstId(), { x: 1, n: 1 })
    expect(store().plan).toBe(before)
    await running.flush()
    expect(db.get(AUTOSAVE_KEY)).toBe(text)
  })

  test('the closing copy wins when it is newer than the main save', async () => {
    const older = serializePlan({ ...store().plan, name: 'Older' }, view, new Date('2026-10-27T10:00:00Z'))
    const newer = serializePlan({ ...store().plan, name: 'Newer' }, view, new Date('2026-10-27T10:00:05Z'))
    const { backend, db } = fakeBackend({ [AUTOSAVE_KEY]: older }, { [SHADOW_KEY]: newer })
    running = startAutosave({ backend, page: fakePage().page })
    await running.ready
    expect(store().plan.name).toBe('Newer')
    await running.flush()
    expect(savedPlan(db).name).toBe('Newer')
  })

  test('each save adds to history, labelled with what changed', async () => {
    let t = Date.parse('2026-10-27T10:00:00Z')
    const now = () => new Date(t)
    const { backend, db } = fakeBackend({ [AUTOSAVE_KEY]: serializePlan(store().plan, view, now()) })
    running = startAutosave({ backend, page: fakePage().page, now })
    await running.ready
    t += 5_000
    store().moveObject(firstId(), { x: 3, n: 3 })
    await running.flush()
    const name = store().plan.objects[firstId()].name
    expect(running.history().map((e) => e.label)).toEqual([`moved ${name}`, 'opened'])
    expect(db.get(HISTORY_KEY)).toEqual(running.history())
  })
})

/** An in-memory plan home with revisions, like the dev server's plan file. */
function fakeHome(initial: string | null = null) {
  let text = initial
  let n = initial ? 1 : 0
  const revNow = () => (text === null ? 'none' : `r${n}`)
  const handlers = new Set<() => void>()
  const home: PlanHome = {
    label: 'the plan file',
    read: async () => ({ rev: revNow(), text }),
    write: async (t, baseRev) => {
      if (baseRev !== revNow()) return { ok: false, conflict: true, rev: revNow(), error: 'changed' }
      text = t
      n++
      return { ok: true, rev: revNow() }
    },
    onChange: (h) => {
      handlers.add(h)
      return () => handlers.delete(h)
    },
  }
  /** Claude edits the file. */
  const editOutside = (t: string) => {
    text = t
    n++
    handlers.forEach((h) => h())
  }
  return { home, editOutside, text: () => text }
}

describe('the plan home', () => {
  let running: Autosave | null = null
  beforeEach(() => {
    store().setReadOnly(null)
    store().loadScheme('C')
    usePlanStore.temporal.getState().clear()
  })
  afterEach(async () => {
    await running?.stop()
    running = null
  })

  test('a missing plan file is created from this browser’s plan', async () => {
    const { backend } = fakeBackend()
    const h = fakeHome()
    running = startAutosave({ backend, page: fakePage().page, home: h.home })
    await running.ready
    expect(readSavedText(h.text()!).file.plan.order).toEqual(store().plan.order)
  })

  test('every save also goes to the plan file', async () => {
    const { backend } = fakeBackend()
    const h = fakeHome()
    running = startAutosave({ backend, page: fakePage().page, home: h.home })
    await running.ready
    store().renameObject(firstId(), 'In the file')
    await running.flush()
    expect(readSavedText(h.text()!).file.plan.objects[firstId()].name).toBe('In the file')
  })

  test('a plan file edited while the app was closed wins over the browser’s copy', async () => {
    const local = serializePlan({ ...store().plan, name: 'Browser copy' }, view, new Date('2026-10-27T12:00:00Z'))
    const edited = serializePlan({ ...store().plan, name: 'Edited by Claude' }, view, new Date('2026-10-27T09:00:00Z'))
    const { backend } = fakeBackend({ [AUTOSAVE_KEY]: local }, { 'islandale-plan.home-rev': 'r0' })
    const h = fakeHome(edited)
    running = startAutosave({ backend, page: fakePage().page, home: h.home })
    await running.ready
    expect(store().plan.name).toBe('Edited by Claude')
  })

  test('an edit to the plan file while the app is open loads as one undoable step', async () => {
    const { backend } = fakeBackend()
    const h = fakeHome()
    running = startAutosave({ backend, page: fakePage().page, home: h.home })
    await running.ready
    const before = store().plan
    h.editOutside(serializePlan({ ...before, name: 'Claude changed it' }, view))
    await settle()
    await settle()
    expect(store().plan.name).toBe('Claude changed it')
    usePlanStore.temporal.getState().undo()
    expect(store().plan).toBe(before)
  })

  test('a plan file from a newer planner, written while the app is open, is not loaded and is never saved over', async () => {
    const { backend } = fakeBackend()
    const h = fakeHome()
    running = startAutosave({ backend, page: fakePage().page, home: h.home })
    await running.ready
    const newer = JSON.stringify({ ...JSON.parse(serializePlan(store().plan, view)), version: 2 })
    h.editOutside(newer)
    await settle()
    await settle()
    expect(store().readOnly).toBe('newer-file')
    store().renameObject(firstId(), 'Would overwrite the newer file')
    await running.flush()
    expect(h.text()).toBe(newer)
  })

  test('a read-only tab does not move this browser’s home revision', async () => {
    const { backend, ls } = fakeBackend({}, { 'islandale-plan.home-rev': 'r0' })
    const h = fakeHome(serializePlan({ ...store().plan, name: 'Edited by Claude' }, view))
    store().setReadOnly('other-tab')
    running = startAutosave({ backend, page: fakePage().page, home: h.home })
    await running.ready
    expect(ls.get('islandale-plan.home-rev')).toBe('r0')
  })

  test('a change notice that arrives while a save is in flight waits for it, so the app does not reload its own save', async () => {
    const { backend } = fakeBackend()
    const h = fakeHome()
    let hold = false
    let release: () => void = () => {}
    let notify: () => void = () => {}
    const home: PlanHome = {
      ...h.home,
      // like the real store, the row holds the new plan before the write call returns
      write: async (t, base) => {
        const result = await h.home.write(t, base)
        if (hold) await new Promise<void>((r) => (release = r))
        return result
      },
      onChange: (handler) => ((notify = handler), () => {}),
    }
    running = startAutosave({ backend, page: fakePage().page, home })
    await running.ready
    hold = true
    store().renameObject(firstId(), 'Saving')
    const saving = running.flush()
    await settle()
    notify() // the snapshot of this very save, delivered before the write returns
    store().renameObject(firstId(), 'Edited after the save started')
    hold = false
    release()
    await saving
    await settle()
    await settle()
    expect(store().plan.objects[firstId()].name).toBe('Edited after the save started')
  })

  test('a save based on an old revision does not overwrite the file; the file’s version is loaded', async () => {
    const { backend } = fakeBackend()
    const h = fakeHome()
    const home: PlanHome = { ...h.home, onChange: () => () => {} } // the change notice is missed
    running = startAutosave({ backend, page: fakePage().page, home })
    await running.ready
    h.editOutside(serializePlan({ ...store().plan, name: 'Claude changed it' }, view))
    store().renameObject(firstId(), 'Stale edit')
    await running.flush()
    await settle()
    expect(store().plan.name).toBe('Claude changed it')
    expect(readSavedText(h.text()!).file.plan.name).toBe('Claude changed it')
  })
})
