import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { checkPlanText, createPlanFileStore, revOf } from './planFileStore'

export const PLAN_ENDPOINT = '/__plan'
/** The saved default scheme, beside the plan file; no revisions, history or change events. */
export const DEFAULT_ENDPOINT = '/__plan-default'
export const DEFAULT_FILE_NAME = 'islandale.default.json'
/** The event the app listens for when the plan file is edited outside the app. */
export const PLAN_CHANGED_EVENT = 'islandale:plan-file'
const MAX_BODY_BYTES = 8 * 1024 * 1024

/**
 * Dev-server endpoint for the plan file: GET reads it (with its revision in
 * the ETag), PUT writes it if If-Match names the current revision, DELETE
 * removes it (for tests; the last version stays in .history). When the
 * file changes on disk for any other reason (Claude Code editing it), the
 * open app is told and reloads it.
 */
export function planFilePlugin(dir = 'data/plans'): Plugin {
  const store = createPlanFileStore(resolve(dir))
  let lastWrittenRev: string | null = null

  const send = (res: ServerResponse, status: number, body: unknown, rev?: string) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    if (rev) res.setHeader('ETag', rev)
    res.end(typeof body === 'string' ? body : JSON.stringify(body))
  }

  /** The body, or null when it is past MAX_BODY_BYTES (the rest is read and dropped, so the 413 reaches the browser). */
  const readBody = (req: IncomingMessage) =>
    new Promise<string | null>((ok, fail) => {
      let size = 0
      let tooLarge = false
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BODY_BYTES) {
          if (!tooLarge) ok(null)
          tooLarge = true
          chunks.length = 0
        } else if (!tooLarge) chunks.push(c)
      })
      req.on('end', () => ok(tooLarge ? null : Buffer.concat(chunks).toString('utf8')))
      req.on('error', fail)
    })
  const declaredTooLarge = (req: IncomingMessage) => Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES
  const tooLargeBody = { error: `The plan is larger than ${MAX_BODY_BYTES / 1024 / 1024} MB.` }

  return {
    name: 'islandale-plan-file',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(store.file)
      // a read that fails here (the file mid-replace, or unreadable) is logged; thrown, it would take the dev server down
      const onFile = async (path: string) => {
        if (resolve(path) !== store.file) return
        try {
          const { rev } = await store.read()
          if (rev === lastWrittenRev) return
          server.ws.send({ type: 'custom', event: PLAN_CHANGED_EVENT, data: { rev } })
        } catch (err) {
          server.config.logger.error(`[plan file] could not read the changed plan file: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      server.watcher.on('change', (p) => void onFile(p))
      server.watcher.on('add', (p) => void onFile(p))

      const defaultFile = join(resolve(dir), DEFAULT_FILE_NAME)
      server.middlewares.use(DEFAULT_ENDPOINT, (req, res) => {
        void (async () => {
          try {
            if (req.method === 'GET') {
              try {
                return send(res, 200, await readFile(defaultFile, 'utf8'))
              } catch (err) {
                if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
                res.setHeader('X-Plan-Missing', '1')
                return send(res, 200, 'null')
              }
            }
            if (req.method === 'PUT') {
              if (declaredTooLarge(req)) {
                res.setHeader('Connection', 'close')
                return send(res, 413, tooLargeBody)
              }
              const text = await readBody(req)
              if (text === null) {
                res.setHeader('Connection', 'close')
                return send(res, 413, tooLargeBody)
              }
              const problem = checkPlanText(text)
              if (problem) return send(res, 400, { error: problem })
              await mkdir(resolve(dir), { recursive: true })
              const temp = `${defaultFile}.${process.pid}.${Date.now()}.tmp`
              await writeFile(temp, text)
              try {
                await rename(temp, defaultFile)
              } catch (err) {
                await rm(temp, { force: true })
                throw err
              }
              return send(res, 200, { ok: true })
            }
            send(res, 405, { error: 'Use GET or PUT.' })
          } catch (err) {
            server.config.logger.error(`[plan default] ${err instanceof Error ? err.message : String(err)}`)
            send(res, 500, { error: 'The default scheme could not be read or written.' })
          }
        })()
      })

      server.middlewares.use(PLAN_ENDPOINT, (req, res) => {
        void (async () => {
          try {
            if (req.method === 'GET') {
              const { rev, text } = await store.read()
              // no file yet is a normal answer, not an error the browser console should report
              if (text === null) {
                res.setHeader('X-Plan-Missing', '1')
                return send(res, 200, 'null', rev)
              }
              return send(res, 200, text, rev)
            }
            if (req.method === 'PUT') {
              if (declaredTooLarge(req)) {
                res.setHeader('Connection', 'close')
                return send(res, 413, tooLargeBody)
              }
              const text = await readBody(req)
              if (text === null) {
                res.setHeader('Connection', 'close')
                return send(res, 413, tooLargeBody)
              }
              const result = await store.put(text, req.headers['if-match'] ?? null)
              if (!result.ok) return send(res, result.status, { error: result.error, rev: result.rev }, result.rev)
              lastWrittenRev = revOf(text)
              return send(res, 200, { rev: result.rev }, result.rev)
            }
            if (req.method === 'DELETE') {
              await store.remove()
              lastWrittenRev = null
              return send(res, 200, { rev: 'none' }, 'none')
            }
            send(res, 405, { error: 'Use GET, PUT or DELETE.' })
          } catch (err) {
            server.config.logger.error(`[plan file] ${err instanceof Error ? err.message : String(err)}`)
            send(res, 500, { error: 'The plan file could not be read or written.' })
          }
        })()
      })
    },
  }
}
