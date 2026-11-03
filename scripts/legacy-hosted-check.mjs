// Phase 3C check of the old planner's ext:hosted-home block, against a fake claude.ai db runtime.
// Needs the legacy preview running on :8777 (see .claude/launch.json). Usage: node scripts/legacy-hosted-check.mjs
import { chromium } from '@playwright/test'

const URL = 'http://localhost:8777/islandale-planner.html'
const ROW = 'legacy/layout'

// A fake runtime: rows kept in sessionStorage so they survive a reload (like the real database),
// change deliveries that can be held back (as when the runtime falls back to a 30 s refresh),
// and own writes echoed first as pending, then confirmed.
const fake = () => {
  const load = () => JSON.parse(sessionStorage.getItem('__rows') || '{}')
  const save = (rows) => sessionStorage.setItem('__rows', JSON.stringify(rows))
  const subs = {}
  window.__writes = 0
  window.__held = []
  window.__hold = false
  const snap = (p, pending = false) => { const rows = load(); return { exists: p in rows, data: () => rows[p], metadata: { hasPendingWrites: pending } } }
  const deliver = (p, pending) => { const s = snap(p, pending); (subs[p] || []).forEach((f) => (window.__hold ? window.__held.push(() => f(s)) : setTimeout(() => f(s), 0))) }
  const db = { doc: (p) => ({
    get: async () => snap(p),
    set: async (d) => { const rows = load(); rows[p] = JSON.parse(JSON.stringify(d)); save(rows); window.__writes++; deliver(p, true); deliver(p, false) },
    onSnapshot: (next) => { (subs[p] = subs[p] || []).push(next); setTimeout(() => next(snap(p)), 0); return () => {} },
  }) }
  window.__row = (p) => load()[p]
  window.__outsideEdit = (p, d) => { const rows = load(); rows[p] = d; save(rows); deliver(p, false) }
  window.__release = () => { const h = window.__held.splice(0); h.forEach((f) => f()) }
  window.claude = { use: async (n) => (n === 'db' ? db : null) }
}

const results = []
const check = (ok, text) => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`) }
const b = await chromium.launch()
const page = await (await b.newContext()).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.addInitScript(fake)
await page.goto(URL)
await page.waitForFunction(() => window.__writes > 0, null, { timeout: 30000 })
const first = await page.evaluate((r) => window.__row(r), ROW)
check(Array.isArray(first?.layout?.objects), `first open writes the layout (${first?.layout?.objects?.length} objects)`)

const name0 = () => page.evaluate(() => JSON.parse(serialize()).objects[0].name)
const rowName0 = () => page.evaluate((r) => window.__row(r).layout.objects[0].name, ROW)
const editLocally = (n) => page.evaluate((n) => { pushUndo(); objects[1].name = n }, n)
const editInDb = (n) => page.evaluate(({ r, n }) => { const x = JSON.parse(JSON.stringify(window.__row(r))); x.layout.objects[0].name = n; window.__outsideEdit(r, x) }, { r: ROW, n })

// 1. an edit made in the database is loaded, and undo goes back and is saved
await editInDb('Renamed by Claude')
await page.waitForTimeout(500)
check((await name0()) === 'Renamed by Claude', 'an edit made in the database is loaded')
await page.evaluate(() => undo())
await page.waitForTimeout(3000)
check((await rowName0()) !== 'Renamed by Claude', 'undo goes back and is saved to the database')

// 2. Claude edits while the change notice is held back and the user edits here: Claude's edit is not overwritten
await page.evaluate(() => (window.__hold = true))
await editInDb('Claude, unseen')
await editLocally('Local edit meanwhile')
await page.waitForTimeout(3000)
check((await rowName0()) === 'Claude, unseen', 'an unseen edit in the database is not written over')
check((await name0()) === 'Claude, unseen', '…it is loaded instead, as an undoable step')
await page.evaluate(() => { window.__hold = false; window.__release() })

// 3. the late echo of this page's own earlier save does not undo a newer edit
await page.evaluate(() => (window.__hold = true))
await editLocally('Save one')
await page.waitForTimeout(2500)
await editLocally('Save two')
await page.evaluate(() => { window.__hold = false; window.__release() })
await page.waitForTimeout(500)
check((await page.evaluate(() => objects[1].name)) === 'Save two', 'a late echo of this page’s own save does not undo a newer edit')

// 4. a newer layout here, not yet sent when the page closed, is kept on reopening
await page.waitForTimeout(2500)
await page.evaluate(() => { pushUndo(); objects[1].name = 'Unsent at close'; window.islandaleAutosave.saveNow() })
await page.evaluate(() => (window.__hold = true))
await page.reload()
await page.waitForTimeout(3000)
check((await page.evaluate(() => objects[1].name)) === 'Unsent at close', 'a newer layout here is kept on reopening, not replaced by the older hosted one')
check((await page.evaluate((r) => window.__row(r).layout.objects[1].name, ROW)) === 'Unsent at close', '…and it is sent to the database')

// 5. a database edit made while the page was closed wins on reopening
await page.evaluate(({ r }) => { const x = JSON.parse(JSON.stringify(window.__row(r))); x.layout.objects[0].name = 'Claude, while closed'; const rows = JSON.parse(sessionStorage.getItem('__rows')); rows[r] = x; sessionStorage.setItem('__rows', JSON.stringify(rows)) }, { r: ROW })
await page.reload()
await page.waitForTimeout(3000)
check((await name0()) === 'Claude, while closed', 'an edit made in the database while the page was closed is loaded on reopening')

check(errors.length === 0, errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors')
await b.close()
process.exit(results.every(Boolean) ? 0 : 1)
