// Side-by-side screenshots: the legacy planner and the new app from the same camera, for Phase 3B checks.
// Usage: node scripts/compare-shots.mjs <out-dir> [scheme-name-regex] [display style, e.g. "White model"]
// Needs both previews running: the new app on :5173 and the legacy folder on :8777.
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? '.'
const scheme = new RegExp(process.argv[3] ?? '^C · Prow')
const style = process.argv[4]
// legacy orbit controls: theta, phi, r around the building centre (as its scheme loader sets them)
const VIEWS = {
  close: { theta: 0.25, phi: 0.9, r: 62 },
  water: { theta: 2.6, phi: 1.2, r: 55 },
  west: { theta: -1.2, phi: 1.15, r: 45 },
}

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] })
const legacy = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await legacy.goto('http://localhost:8777/islandale-planner.html')
await legacy.waitForTimeout(5000)
await legacy.getByRole('button', { name: 'Got it' }).click({ timeout: 3000 }).catch(() => {})
const cards = legacy.locator('#schemes .scheme')
for (let i = 0; i < (await cards.count()); i++) {
  if (scheme.test(await cards.nth(i).locator('b').innerText())) {
    await cards.nth(i).locator('button').click({ force: true })
    break
  }
}
await legacy.waitForTimeout(4000)
// hide the legacy chrome so only the 3D view is compared
await legacy.addStyleTag({ content: '#side, .panel, #hud, #toast, .key { display: none !important }' })

const app = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await app.goto('http://localhost:5173/')
await app.waitForFunction(() => (window).islandale?.look, null, { timeout: 60000 })
await app.waitForTimeout(4000)
if (style) await app.getByRole('group', { name: 'Display style' }).getByRole('button', { name: style, exact: true }).click()

for (const [name, v] of Object.entries(VIEWS)) {
  await legacy.evaluate(({ theta, phi, r }) => {
    controls.theta = theta; controls.phi = phi; controls.r = r; controls.update()
  }, v)
  // the legacy camera eases into place over the next frames; read it when the shot is taken
  await legacy.waitForTimeout(2500)
  await legacy.screenshot({ path: `${out}/${name}-legacy.png` })
  const pose = await legacy.evaluate(() => ({ position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov }))
  console.log(name, JSON.stringify(pose))
  await app.evaluate(({ position, target, fov }) => (window).islandale.look(position, target, fov), pose)
  await app.waitForTimeout(1500)
  await app.screenshot({ path: `${out}/${name}-new.png` })
}
await browser.close()
