import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LOCK_NAME, startTabLock, type ChannelLike, type LockManagerLike, type TabLock } from './tabLock'
import { usePlanStore } from './planStore'
import type { Autosave } from './autosave'

/** An in-memory Web Locks stand-in with ifAvailable, steal and signal. */
function fakeLocks() {
  type Holder = { reject: (e: Error) => void }
  let holder: Holder | null = null
  const waiting: (() => void)[] = []
  const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' })

  const grant = (cb: (lock: unknown) => unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const me: Holder = { reject }
      holder = me
      Promise.resolve(cb({ name: LOCK_NAME })).then((v) => {
        if (holder === me) {
          holder = null
          waiting.shift()?.()
        }
        resolve(v)
      }, reject)
    })

  const locks: LockManagerLike = {
    request: (_name, opts, cb) => {
      if (opts.steal) {
        holder?.reject(abortError())
        holder = null
        return grant(cb)
      }
      if (!holder) return grant(cb)
      if (opts.ifAvailable) return Promise.resolve(cb(null))
      return new Promise((resolve, reject) => {
        const go = () => grant(cb).then(resolve, reject)
        waiting.push(go)
        opts.signal?.addEventListener('abort', () => {
          const i = waiting.indexOf(go)
          if (i >= 0) waiting.splice(i, 1)
          reject(abortError())
        })
      })
    },
  }
  return { locks, isHeld: () => holder !== null }
}

function fakeChannel() {
  const listeners = new Set<(e: MessageEvent) => void>()
  const sent: unknown[] = []
  const channel: ChannelLike = {
    postMessage: (m) => void sent.push(m),
    addEventListener: (_t, l) => void listeners.add(l),
    removeEventListener: (_t, l) => void listeners.delete(l),
    close: () => listeners.clear(),
  }
  const receive = (data: unknown) => listeners.forEach((l) => l(new MessageEvent('message', { data })))
  return { channel, sent, receive }
}

function fakeAutosave() {
  return { flush: vi.fn(async () => {}), reload: vi.fn(async () => {}) } as unknown as Autosave & {
    flush: ReturnType<typeof vi.fn>
    reload: ReturnType<typeof vi.fn>
  }
}

const store = () => usePlanStore.getState()
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('one editor at a time', () => {
  let lock: TabLock | null = null
  beforeEach(() => store().setReadOnly(null))
  afterEach(() => {
    lock?.stop()
    lock = null
  })

  test('the first tab edits', async () => {
    const { locks, isHeld } = fakeLocks()
    lock = startTabLock({ locks, channel: fakeChannel().channel, autosave: () => null })
    await lock.ready
    expect(store().readOnly).toBeNull()
    expect(isHeld()).toBe(true)
  })

  test('a second tab opens read-only, and Take over moves editing to it', async () => {
    const { locks } = fakeLocks()
    let otherLost: unknown = null
    void locks.request(LOCK_NAME, {}, () => new Promise(() => {})).catch((e) => (otherLost = e))
    const { channel, receive } = fakeChannel()
    const saver = fakeAutosave()
    lock = startTabLock({ locks, channel, autosave: () => saver, flushWaitMs: 1000 })
    await lock.ready
    expect(store().readOnly).toBe('other-tab')
    const before = store().plan
    store().moveObject(before.order[0], { x: 9, n: 9 })
    expect(store().plan).toBe(before)

    const taking = lock.takeOver()
    await settle()
    expect((otherLost as Error)?.name).toBe('AbortError')
    receive({ type: 'flushed' })
    await taking
    expect(store().readOnly).toBeNull()
    expect(saver.reload).toHaveBeenCalledTimes(1)
  })

  test('the tab that loses editing saves first, goes read-only and tells the new editor', async () => {
    const { locks } = fakeLocks()
    const { channel, sent } = fakeChannel()
    const saver = fakeAutosave()
    lock = startTabLock({ locks, channel, autosave: () => saver })
    await lock.ready
    void locks.request(LOCK_NAME, { steal: true }, () => new Promise(() => {}))
    await settle()
    expect(saver.flush).toHaveBeenCalledTimes(1)
    expect(store().readOnly).toBe('other-tab')
    expect(sent).toContainEqual({ type: 'flushed' })
  })

  test('a read-only tab becomes the editor when the editing tab closes', async () => {
    const { locks } = fakeLocks()
    let closeOther: () => void = () => {}
    void locks.request(LOCK_NAME, {}, () => new Promise<void>((r) => (closeOther = r)))
    const saver = fakeAutosave()
    lock = startTabLock({ locks, channel: fakeChannel().channel, autosave: () => saver, flushWaitMs: 5 })
    await lock.ready
    expect(store().readOnly).toBe('other-tab')
    closeOther()
    await new Promise((r) => setTimeout(r, 20))
    expect(store().readOnly).toBeNull()
    expect(saver.reload).toHaveBeenCalledTimes(1)
  })
})
