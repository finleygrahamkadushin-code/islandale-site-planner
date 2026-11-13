// Phase 3C check of the old planner's ext:openings-fit and ext:autosave blocks.
// Needs the legacy preview running on :8777 (see .claude/launch.json). Usage: node scripts/legacy-openings-check.mjs
import { chromium } from '@playwright/test'

const URL = 'http://localhost:8777/islandale-planner.html'
// this copy tests Scheme C only (the full set is on main)
const SCHEMES = [/^C · Prow/]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(URL)
await page.waitForFunction(() => window.islandaleFitOpenings && window.islandaleAutosave, null, { timeout: 60_000 })

let failed = 0
for (const re of SCHEMES) {
  const result = await page.evaluate((src) => {
    const re = new RegExp(src)
    const s = SCHEMES.find((x) => re.test(x.name))
    if (!s) return { name: src, missing: true }
    pushUndo()
    loadLayout(JSON.stringify({ objects: s.objects, rulesOff: !!s.rulesOff }))
    let fitted = 0
    const problems = []
    objects.filter(isBuilding).forEach((o) => {
      fitted += window.islandaleFitOpenings(o)
      masses(o).forEach((m, mi) => {
        // curved walls take along-cuts round the perimeter; the per-wall checks are for straight walls
        if (isOpen(m) || isCurved(m)) return
        const cuts = (mi === 0 ? o.cuts : m.cuts) || []
        wallEdges(o, m).forEach((e) => {
          const L = e.L * M2FT
          const on = cuts.filter((c) => !c.along && c.edge === e.i).sort((a, b) => a.x - b.x)
          on.forEach((c, k) => {
            const tr = typeof c.trim === 'number' ? c.trim : 3.5 / 12
            const where = `${o.name} mass ${mi} wall ${e.i} cut ${c.id}`
            if (c.x - tr < 0.75 - 1e-6 || L - (c.x + c.w) - tr < 0.75 - 1e-6) problems.push(`${where}: nearer than 9 in to a corner`)
            if (c.sill < 0) problems.push(`${where}: sill below the floor`)
            if (c.sill + c.h > m.h - 0.5 + 1e-6) problems.push(`${where}: head within 6 in of the eave`)
            const next = on[k + 1]
            if (next) {
              const tn = typeof next.trim === 'number' ? next.trim : 3.5 / 12
              if (next.x - tn - (c.x + c.w + tr) < 4 / 12 - 1e-6) problems.push(`${where}: overlaps or touches cut ${next.id}`)
            }
          })
        })
      })
    })
    return { name: s.name, fitted, problems }
  }, re.source)
  const bad = result.missing || result.problems.length > 0
  if (bad) failed++
  console.log(`${bad ? 'FAIL' : 'ok  '} ${result.name}${result.missing ? ' (not found)' : `: ${result.fitted} openings fitted, ${result.problems.length} problems`}`)
  for (const p of result.problems ?? []) console.log(`     ${p}`)
}

// autosave: a change with no Save click survives a reload
const name = `Autosave check ${Date.now() % 10000}`
await page.evaluate((name) => {
  pushUndo()
  objects[0].name = name
}, name)
await page.waitForTimeout(700)
await page.reload()
await page.waitForFunction(() => window.islandaleAutosave, null, { timeout: 60_000 })
const kept = await page.evaluate(() => objects[0].name)
const saved = kept === name
if (!saved) failed++
console.log(`${saved ? 'ok  ' : 'FAIL'} a change with no Save click survives a reload`)

if (errors.length) {
  failed++
  console.log(`FAIL console errors:\n  ${errors.slice(0, 5).join('\n  ')}`)
}
await browser.close()
process.exit(failed ? 1 : 0)
