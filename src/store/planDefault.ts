import { useSyncExternalStore } from 'react'

/**
 * The saved default scheme: a plan file the person chose with File → Save as
 * default scheme. Reset and a fresh start open it instead of Scheme C. Under
 * the dev server it is data/plans/islandale.default.json, served at
 * /__plan-default (vite/planFilePlugin.ts), so it lives beside the plan file;
 * anywhere else (the hosted build) it is one localStorage entry.
 */

// Kept in step with vite/planFilePlugin.ts.
const ENDPOINT = '/__plan-default'
export const DEFAULT_KEY = 'islandale-plan.default'

export interface DefaultStore {
  readonly label: string
  /** The saved default's plan-file text, or null when none is saved (or it cannot be read). */
  readonly read: () => Promise<string | null>
  /** Save plan-file text as the default; throws when it could not be saved. */
  readonly write: (text: string) => Promise<void>
}

export interface DefaultStoreOptions {
  /** True under the dev server, where the repo file is reachable. */
  readonly dev?: boolean
  readonly fetch?: typeof fetch
  readonly storage?: () => Pick<Storage, 'getItem' | 'setItem'>
}

export function createDefaultStore({
  dev = import.meta.env.DEV,
  fetch: doFetch = (...a) => fetch(...a),
  storage = () => localStorage,
}: DefaultStoreOptions = {}): DefaultStore {
  if (dev) {
    return {
      label: 'data/plans/islandale.default.json',
      read: async () => {
        try {
          const res = await doFetch(ENDPOINT, { cache: 'no-store' })
          if (!res.ok || res.headers.get('X-Plan-Missing') === '1') return null
          const text = await res.text()
          return text && text !== 'null' ? text : null
        } catch (err) {
          console.error('[plan default] read failed', err)
          return null
        }
      },
      write: async (text) => {
        const res = await doFetch(ENDPOINT, { method: 'PUT', body: text, headers: { 'Content-Type': 'application/json' } })
        if (res.ok) return
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      },
    }
  }
  return {
    label: 'this browser',
    read: async () => {
      try {
        return storage().getItem(DEFAULT_KEY) || null
      } catch (err) {
        console.error('[plan default] read failed', err)
        return null
      }
    },
    write: async (text) => {
      try {
        storage().setItem(DEFAULT_KEY, text)
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : 'this browser would not store it')
      }
    },
  }
}

export const defaultStore: DefaultStore = createDefaultStore()

// Whether a default is saved, for the File menu (which shows "Reset to original Scheme C" only then).
let exists = false
const listeners = new Set<() => void>()
export function setHasDefault(v: boolean): void {
  if (v === exists) return
  exists = v
  listeners.forEach((l) => l())
}
export const refreshHasDefault = async (store: DefaultStore = defaultStore): Promise<boolean> => {
  const has = (await store.read()) !== null
  setHasDefault(has)
  return has
}
export const useHasDefault = (): boolean =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => exists,
  )
