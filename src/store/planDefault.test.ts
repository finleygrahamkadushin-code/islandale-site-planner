import { describe, expect, test, vi } from 'vitest'
import { createDefaultStore, DEFAULT_KEY } from './planDefault'

const response = (body: string, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(body, { status: init.status ?? 200, headers: init.headers })

function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial))
  return { m, storage: () => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }) }
}

describe('the default scheme store: dev endpoint', () => {
  test('reads the file text from /__plan-default', async () => {
    const fetch = vi.fn(async () => response('{"version":1}'))
    const store = createDefaultStore({ dev: true, fetch })
    expect(await store.read()).toBe('{"version":1}')
    expect(fetch).toHaveBeenCalledWith('/__plan-default', { cache: 'no-store' })
  })

  test('no saved default reads as null (the missing header, "null" body, or an error status)', async () => {
    expect(await createDefaultStore({ dev: true, fetch: async () => response('null', { headers: { 'X-Plan-Missing': '1' } }) }).read()).toBeNull()
    expect(await createDefaultStore({ dev: true, fetch: async () => response('null') }).read()).toBeNull()
    expect(await createDefaultStore({ dev: true, fetch: async () => response('x', { status: 500 }) }).read()).toBeNull()
  })

  test('an unreachable server reads as null, not a throw', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const store = createDefaultStore({
      dev: true,
      fetch: async () => {
        throw new Error('offline')
      },
    })
    expect(await store.read()).toBeNull()
  })

  test('writes the text with PUT', async () => {
    const fetch = vi.fn(async () => response('{"ok":true}'))
    await createDefaultStore({ dev: true, fetch }).write('TEXT')
    expect(fetch).toHaveBeenCalledWith('/__plan-default', { method: 'PUT', body: 'TEXT', headers: { 'Content-Type': 'application/json' } })
  })

  test('a refused write throws the server\'s reason', async () => {
    const fetch = async () => response('{"error":"The plan is not JSON."}', { status: 400 })
    await expect(createDefaultStore({ dev: true, fetch }).write('x')).rejects.toThrow('The plan is not JSON.')
  })

  test('never touches localStorage', async () => {
    const { m, storage } = memoryStorage()
    await createDefaultStore({ dev: true, fetch: async () => response('{}'), storage }).write('T')
    expect(m.size).toBe(0)
  })
})

describe('the default scheme store: localStorage fallback', () => {
  test('writes and reads back under the default key, without fetching', async () => {
    const fetch = vi.fn()
    const { m, storage } = memoryStorage()
    const store = createDefaultStore({ dev: false, fetch, storage })
    expect(await store.read()).toBeNull()
    await store.write('TEXT')
    expect(m.get(DEFAULT_KEY)).toBe('TEXT')
    expect(await store.read()).toBe('TEXT')
    expect(fetch).not.toHaveBeenCalled()
  })

  test('storage that throws reads as null and fails the write with a message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const storage = () => {
      throw new Error('blocked')
    }
    const store = createDefaultStore({ dev: false, storage })
    expect(await store.read()).toBeNull()
    await expect(store.write('x')).rejects.toThrow('blocked')
  })

  test('a quota error on write is reported', async () => {
    const storage = () => ({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    await expect(createDefaultStore({ dev: false, storage }).write('x')).rejects.toThrow('QuotaExceededError')
  })
})
