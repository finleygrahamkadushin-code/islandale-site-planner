import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { planFilePlugin } from './planFilePlugin'
import { PLAN_FILE_NAME } from './planFileStore'

type Handler = (req: unknown, res: unknown) => void

/** Just enough of a Vite dev server to load the plugin. */
function fakeServer() {
  const watcher = Object.assign(new EventEmitter(), { add: () => undefined })
  const handlers: Record<string, Handler> = {}
  const errors: string[] = []
  const sent: unknown[] = []
  const server = {
    watcher,
    middlewares: { use: (path: string, h: Handler) => void (handlers[path] = h) },
    ws: { send: (m: unknown) => sent.push(m) },
    config: { logger: { error: (m: string) => errors.push(m) } },
  }
  return { server, watcher, errors, sent, handle: (req: unknown, res: unknown, path = '/__plan') => handlers[path]?.(req, res) }
}

function fakeRes() {
  const headers: Record<string, string> = {}
  let done: (v: { status: number; body: string }) => void = () => undefined
  const finished = new Promise<{ status: number; body: string }>((r) => (done = r))
  const res = {
    statusCode: 0,
    setHeader: (k: string, v: string) => void (headers[k.toLowerCase()] = v),
    end: (body: string) => done({ status: res.statusCode, body }),
  }
  return { res, finished, headers }
}

function putRequest(body: Buffer, headers: Record<string, string> = {}) {
  const req = Object.assign(new PassThrough(), { method: 'PUT', headers: { 'if-match': 'none', ...headers } })
  queueMicrotask(() => req.end(body))
  return req
}

describe('the dev server plan endpoint (R6.13)', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plan-plugin-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const load = () => {
    const f = fakeServer()
    const plugin = planFilePlugin(dir)
    ;(plugin.configureServer as (s: unknown) => void)(f.server)
    return f
  }

  test('an oversized plan is answered 413, not left hanging or 500', async () => {
    const f = load()
    const { res, finished } = fakeRes()
    f.handle(putRequest(Buffer.alloc(9 * 1024 * 1024, 32)), res)
    expect((await finished).status).toBe(413)
  })

  test('a Content-Length past the limit is refused before the body is read', async () => {
    const f = load()
    const { res, finished } = fakeRes()
    const req = Object.assign(new PassThrough(), { method: 'PUT', headers: { 'if-match': 'none', 'content-length': String(64 * 1024 * 1024) } })
    f.handle(req, res)
    expect((await finished).status).toBe(413)
  })

  test('a plan file that cannot be read when it changes is logged; nothing is thrown', async () => {
    const f = load()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    // a directory where the file should be: reading it fails with EISDIR
    await mkdir(join(dir, PLAN_FILE_NAME))
    f.watcher.emit('change', join(dir, PLAN_FILE_NAME))
    await new Promise((r) => setTimeout(r, 50))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(f.errors.join('\n')).toMatch(/plan file/)
  })

  test('a change on disk is announced to the app', async () => {
    const f = load()
    await writeFile(join(dir, PLAN_FILE_NAME), JSON.stringify({ version: 1, plan: {} }))
    f.watcher.emit('change', join(dir, PLAN_FILE_NAME))
    await new Promise((r) => setTimeout(r, 50))
    expect(f.sent).toHaveLength(1)
  })

  test('the default scheme: missing reads as null, a saved plan reads back, a non-plan is refused, and the plan file is untouched', async () => {
    const f = load()
    const get = () => {
      const { res, finished, headers } = fakeRes()
      f.handle({ method: 'GET', headers: {} }, res, '/__plan-default')
      return finished.then((r) => ({ ...r, headers }))
    }
    const missing = await get()
    expect(missing.body).toBe('null')
    expect(missing.headers['x-plan-missing']).toBe('1')

    const text = JSON.stringify({ version: 1, plan: { name: 'mine' } })
    const put = fakeRes()
    f.handle(putRequest(Buffer.from(text)), put.res, '/__plan-default')
    expect((await put.finished).status).toBe(200)
    expect(await readFile(join(dir, 'islandale.default.json'), 'utf8')).toBe(text)
    expect((await get()).body).toBe(text)
    await expect(readFile(join(dir, PLAN_FILE_NAME), 'utf8')).rejects.toThrow()

    const bad = fakeRes()
    f.handle(putRequest(Buffer.from('{"nope":1}')), bad.res, '/__plan-default')
    expect((await bad.finished).status).toBe(400)
    expect((await get()).body).toBe(text)
  })
})
