// Phase 3C check of the built hosted home: the main page alone gets a fake claude.ai runtime, as on
// claude.ai; the app saves plans/islandale, and the Old planner frame saves legacy/layout through it.
// Usage: npm run build, then node scripts/hosted-build-check.mjs (it starts vite preview itself).
import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'

const PORT = 4179
const fake = () => {
  if (window.top !== window) return // only the main page gets the runtime
  const rows = {}
  const subs = {}
  window.__rows = rows
  const snap = (p, pending = false) => ({ exists: p in rows, data: () => rows[p], metadata: { hasPendingWrites: pending } })
  const db = { doc: (p) => ({
    get: async () => snap(p),
    set: async (d) => { rows[p] = JSON.parse(JSON.stringify(d)); (subs[p] || []).forEach((f) => setTimeout(() => f(snap(p)), 0)) },
    acquire: async () => ({ acquired: true }),
    onSnapshot: (next) => { (subs[p] = subs[p] || []).push(next); setTimeout(() => next(snap(p)), 0); return () => {} },
  }) }
  window.claude = { use: async (n) => (n === 'db' ? db : null) }
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const results = []
const check = (ok, text) => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`) }
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break } catch {} await new Promise((r) => setTimeout(r, 200)) }
  const b = await chromium.launch()
  const page = await (await b.newContext()).newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(fake)
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForFunction(() => !!window.__rows['plans/islandale'], null, { timeout: 30000 })
  check(true, 'the new planner saves plans/islandale')
  await page.getByRole('button', { name: 'Old planner' }).click()
  await page.waitForFunction(() => !!window.__rows['legacy/layout'], null, { timeout: 60000 }).catch(() => {})
  const legacy = await page.evaluate(() => window.__rows['legacy/layout'])
  check(Array.isArray(legacy?.layout?.objects), `the Old planner frame saves legacy/layout through the main page (${legacy?.layout?.objects?.length ?? 0} objects)`)
  const frameOwn = await page.frameLocator('iframe[title="The old planner"]').locator('body').evaluate(() => typeof window.claude)
  check(frameOwn === 'undefined', 'the frame has no runtime of its own, as on claude.ai')
  await page.getByRole('button', { name: 'Back to the new planner' }).click()
  check((await page.locator('iframe[title="The old planner"]').count()) === 0, 'Back to the new planner closes it')
  check(errors.length === 0, errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors')
  await b.close()
} finally {
  server.kill()
}
process.exit(results.every(Boolean) ? 0 : 1)
