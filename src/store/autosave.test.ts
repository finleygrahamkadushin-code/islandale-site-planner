import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { startAutosave, type Autosave, type PageEvents } from './autosave'
import { AUTOSAVE_KEY, SHADOW_KEY, UNREADABLE_PREFIX, readSavedText, serializePlan, type SaveBackend } from './persistence'
import { HISTORY_KEY } from './history'
import { usePlanStore } from './planStore'
import { DEFAULT_LAYERS } from './types'

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
