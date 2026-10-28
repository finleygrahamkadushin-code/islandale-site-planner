import { usePlanStore } from './planStore'
import type { Autosave } from './autosave'

/**
 * One editor at a time: the first tab holds a Web Lock and edits; any other
 * tab opens read-only until it takes over (or the editing tab closes). The
 * tab giving up the lock saves first and says so on a BroadcastChannel, so
 * the new editor reloads the latest plan.
 */

export const LOCK_NAME = 'islandale-plan-editor'
export const CHANNEL_NAME = 'islandale-plan'
const FLUSH_WAIT_MS = 1500

/** The parts of the Web Locks API used here, so tests can pass a fake. */
export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<unknown> | unknown,
  ): Promise<unknown>
}

export interface ChannelLike {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (e: MessageEvent) => void): void
  close(): void
}

export interface TabLock {
  /** Resolves once this tab knows whether it is the editor. */
  readonly ready: Promise<void>
  /** Take editing over from the other tab. */
  readonly takeOver: () => Promise<void>
  readonly stop: () => void
}

interface Options {
  readonly locks: LockManagerLike
  readonly channel: ChannelLike
  /** The running autosave, read when it is needed. */
  readonly autosave: () => Autosave | null
  readonly flushWaitMs?: number
}

let current: TabLock | null = null
export const activeTabLock = (): TabLock | null => current

export function startTabLock({ locks, channel, autosave, flushWaitMs = FLUSH_WAIT_MS }: Options): TabLock {
  const store = usePlanStore
  let release: (() => void) | null = null
  let queued: AbortController | null = null
  let stopped = false
  let decide: () => void = () => {}
  const ready = new Promise<void>((r) => (decide = r))

  const hold = () => new Promise<void>((r) => (release = r))
  const isAbort = (err: unknown) => err instanceof Error && err.name === 'AbortError'

  const editable = () => {
    if (store.getState().readOnly === 'other-tab') store.getState().setReadOnly(null)
  }

  /** Become the editor after another tab had the plan: wait for its last save, then read it. */
  const gainFromOther = async () => {
    await waitForFlush()
    editable()
    await autosave()?.reload()
  }

  const waitForFlush = () =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        channel.removeEventListener('message', onMessage)
        resolve()
      }
      const onMessage = (e: MessageEvent) => {
        if ((e.data as { type?: string })?.type === 'flushed') done()
      }
      const timer = setTimeout(done, flushWaitMs)
      channel.addEventListener('message', onMessage)
    })

  /** Another tab stole the lock: save what is pending, go read-only, and say so. */
  const lost = async (err: unknown) => {
    if (stopped) return
    if (!isAbort(err)) console.error('[tab lock] lost the editing lock', err)
    release = null
    try {
      await autosave()?.flush()
    } finally {
      store.getState().setReadOnly('other-tab')
      store.getState().showToast('Editing moved to another tab; this one is now read-only')
      channel.postMessage({ type: 'flushed' })
      queue()
    }
  }

  /** Wait in line, so this tab becomes the editor when the editing tab closes. */
  const queue = () => {
    if (stopped) return
    queued = new AbortController()
    locks
      .request(LOCK_NAME, { signal: queued.signal }, async () => {
        queued = null
        await gainFromOther()
        await hold()
      })
      .catch((err) => (isAbort(err) && !release ? undefined : lost(err)))
  }

  locks
    .request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        store.getState().setReadOnly('other-tab')
        decide()
        queue()
        return
      }
      decide()
      await hold()
    })
    .catch(lost)

  const api: TabLock = {
    ready,
    takeOver: async () => {
      if (release) return
      queued?.abort()
      queued = null
      const flushed = waitForFlush()
      await new Promise<void>((granted) => {
        locks
          .request(LOCK_NAME, { steal: true }, async () => {
            await flushed
            editable()
            await autosave()?.reload()
            granted()
            await hold()
          })
          .catch(lost)
      })
    },
    stop: () => {
      stopped = true
      queued?.abort()
      release?.()
      channel.close()
      if (current === api) current = null
    },
  }
  current = api
  return api
}
