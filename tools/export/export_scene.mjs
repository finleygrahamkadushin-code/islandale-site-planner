#!/usr/bin/env node
// Islandale 3D export, headless (Phase 6B): opens the new app in headless Chromium, loads a scheme (or a .plan.json),
// waits for the scene to settle, runs the app's own Export 3D model and writes the .glb and its manifest, the files
// tools/blender reads. Same file contract as the old exporter (tools/export-legacy/), which drove the old planner.
//
//   node tools/export/export_scene.mjs [--scheme C] [--plan my.plan.json] [--out build/3d/export] [--no-interiors]
//                                      [--url http://localhost:5173] [--port 5175]
//
//   --scheme        scheme id from data/islandale/schemes.json (default C, "C · Prow & Lantern").
//   --plan          a plan file saved from the app (Save) instead of a scheme.
//   --out           output folder (default build/3d/export, gitignored).
//   --no-interiors  leave out the rooms and furniture inside the cabins.
//   --url           use a dev server that is already running; otherwise one is started on --port with its own
//                   plan folder (build/3d/plan-home), so the export never touches the plan you work on.
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const PLAN_HOME = path.join(ROOT, 'build', '3d', 'plan-home')
const DEFAULT_OUT = path.join(ROOT, 'build', '3d', 'export')
const DEFAULT_PORT = 5175
const SERVER_TIMEOUT_MS = 60_000
const SETTLE_POLL_MS = 500
const SETTLE_STABLE_POLLS = 4
const SETTLE_TIMEOUT_MS = 120_000
const VIEWPORT = { width: 960, height: 640 }
const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
const SEASONED = { 'islandale-mode': 'advanced', 'islandale-tour': 'done' }

function cli() {
  const { values } = parseArgs({
    options: {
      scheme: { type: 'string' },
      plan: { type: 'string' },
      out: { type: 'string' },
      url: { type: 'string' },
      port: { type: 'string' },
      'no-interiors': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
    process.exit(0)
  }
  if (values.scheme && values.plan) throw new Error('give --scheme or --plan, not both')
  const plan = values.plan ? path.resolve(values.plan) : null
  if (plan && !fs.existsSync(plan)) throw new Error(`no plan file at ${plan}`)
  const port = Number(values.port ?? DEFAULT_PORT)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`bad --port ${values.port}`)
  return { scheme: plan ? null : (values.scheme ?? 'C'), plan, out: path.resolve(values.out ?? DEFAULT_OUT), url: values.url ?? null, port, interiors: !values['no-interiors'] }
}

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

async function waitForServer(url, child) {
  const t0 = Date.now()
  while (Date.now() - t0 < SERVER_TIMEOUT_MS) {
    if (child?.exitCode != null) throw new Error(`dev server exited with code ${child.exitCode}`)
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, SETTLE_POLL_MS))
  }
  throw new Error(`dev server did not answer at ${url} within ${SERVER_TIMEOUT_MS / 1000} s`)
}

function startServer(port) {
  fs.mkdirSync(PLAN_HOME, { recursive: true })
  const child = spawn('npm', ['run', 'dev'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ISLANDALE_PLAN_DIR: PLAN_HOME }, stdio: ['ignore', 'pipe', 'pipe'] })
  const log = []
  child.stdout.on('data', (d) => log.push(String(d)))
  child.stderr.on('data', (d) => log.push(String(d)))
  return { child, log }
}

/** Mesh and triangle counts unchanged for a few polls in a row. */
async function waitForSettle(page, label) {
  const t0 = Date.now()
  let last = null
  let stable = 0
  while (stable < SETTLE_STABLE_POLLS) {
    if (Date.now() - t0 > SETTLE_TIMEOUT_MS) throw new Error(`scene did not settle (${label}) within ${SETTLE_TIMEOUT_MS / 1000} s`)
    await page.waitForTimeout(SETTLE_POLL_MS)
    const sig = await page.evaluate(() => JSON.stringify(window.islandale.sceneStats?.() ?? null))
    stable = sig === last && sig !== 'null' ? stable + 1 : 0
    last = sig
  }
  return JSON.parse(last)
}

async function main() {
  const opts = cli()
  const t0 = Date.now()
  const server = opts.url ? null : startServer(opts.port)
  const base = opts.url ?? `http://localhost:${opts.port}`
  const browser = await chromium.launch({ args: BROWSER_ARGS })
  const pageErrors = []
  try {
    await waitForServer(base, server?.child)
    const context = await browser.newContext({
      viewport: VIEWPORT,
      storageState: { cookies: [], origins: [{ origin: new URL(base).origin, localStorage: Object.entries(SEASONED).map(([name, value]) => ({ name, value })) }] },
    })
    const page = await context.newPage()
    page.on('pageerror', (e) => pageErrors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') pageErrors.push(m.text())
    })
    await page.goto(base, { waitUntil: 'load' })
    await page.waitForFunction(() => typeof window.islandale?.exportModel === 'function', null, { timeout: SETTLE_TIMEOUT_MS })
    if (opts.scheme) await page.evaluate((id) => window.islandale.store.getState().loadScheme(id), opts.scheme)
    else await page.locator('input[type="file"]').first().setInputFiles(opts.plan)
    const stats = await waitForSettle(page, opts.scheme ? `scheme ${opts.scheme}` : path.basename(opts.plan))

    const result = await page.evaluate((interiors) => window.islandale.exportModel({ interiors }), opts.interiors)
    const commit = git('rev-parse', 'HEAD')
    const dirty = git('status', '--porcelain', '--', 'src', 'data').length > 0
    const manifest = { ...result.manifest, commit, dirty, pageErrors }
    fs.mkdirSync(opts.out, { recursive: true })
    const glbPath = path.join(opts.out, `${result.slug}.glb`)
    const manPath = path.join(opts.out, `${result.slug}.manifest.json`)
    fs.writeFileSync(glbPath, Buffer.from(result.glbBase64, 'base64'))
    fs.writeFileSync(manPath, JSON.stringify(manifest, null, 1) + '\n')

    const s = manifest.stats
    console.log(`scene      ${manifest.scene}  (${opts.scheme ? `scheme ${opts.scheme}` : 'plan file'}; drawn: ${stats.meshes} meshes)`)
    console.log(`objects    ${s.objects}`)
    console.log(`meshes     ${s.meshes}  (nodes ${s.nodes}, materials ${s.materials})`)
    console.log(`triangles  ${s.triangles.toLocaleString('en-US')}`)
    console.log(`bytes      ${s.bytes.toLocaleString('en-US')}  (${(s.bytes / 1048576).toFixed(2)} MB)`)
    console.log(`glb        ${glbPath}`)
    console.log(`manifest   ${manPath}`)
    if (pageErrors.length) console.log(`warning    ${pageErrors.length} page error(s), listed in the manifest's pageErrors`)
    console.log(`time       ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  } catch (e) {
    if (server?.log.length) console.error(server.log.slice(-20).join(''))
    throw e
  } finally {
    await browser.close()
    server?.child.kill()
  }
}

main().catch((e) => {
  console.error(`export failed: ${e.stack || e.message}`)
  process.exit(1)
})
