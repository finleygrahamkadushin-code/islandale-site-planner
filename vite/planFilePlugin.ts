import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { createPlanFileStore, revOf } from './planFileStore'

export const PLAN_ENDPOINT = '/__plan'
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

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((ok, fail) => {
      let size = 0
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BODY_BYTES) {
          fail(new Error('The plan is too large.'))
          req.destroy()
        } else chunks.push(c)
      })
      req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')))
      req.on('error', fail)
    })

  return {
    name: 'islandale-plan-file',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(store.file)
      const onFile = async (path: string) => {
        if (resolve(path) !== store.file) return
        const { rev } = await store.read()
        if (rev === lastWrittenRev) return
        server.ws.send({ type: 'custom', event: PLAN_CHANGED_EVENT, data: { rev } })
      }
      server.watcher.on('change', (p) => void onFile(p))
      server.watcher.on('add', (p) => void onFile(p))

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
              const text = await readBody(req)
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
