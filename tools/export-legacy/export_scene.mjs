#!/usr/bin/env node
// Islandale 3D export: loads the site planner (index.html) in headless Chromium with fresh storage, lets the scene settle, and writes
// the 3D scene as one binary glTF plus a JSON manifest, for Blender (tools/blender) and then Unreal Engine 5.
//
//   node tools/export/export_scene.mjs [--scheme "C · Prow & Lantern"] [--layout layout.json] [--out build/3d/export] [--exag 1]
//
//   --scheme   a scheme from the planner's Schemes panel: its full name or its letter code ("C", "C2", "H"); default "C · Prow & Lantern".
//              "starter" keeps the layout the planner boots with when nothing is saved.
//   --layout   a layout JSON saved from the planner (Copy layout / Save); used instead of --scheme.
//   --out      output folder (default build/3d/export, gitignored).
//   --exag     vertical exaggeration, 1 to 3 in steps of 0.25 like the planner's slider (default 1).
//
// Writes <out>/<slug>.glb and <out>/<slug>.manifest.json and prints a summary. The glb's top-level nodes are Terrain, Earthworks, Water
// and Objects; Objects holds one node per planner object ("<name> #<id>") and under it one mesh per drawn element, named
// "<name> #<id>|<part>|m<mi>|e<ei>|<k>" and tagged (glTF extras) with what it is. tools/export/page_export.js builds it inside the page.
// Playwright 1.64.1 comes from tools/export/node_modules (npm install there) or, failing that, from the main checkout's node_modules.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { countGlb, finishJson, readGlb, writeGlb } from './glb.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PLANNER = path.join(ROOT, 'legacy', 'islandale-planner.html');   // moved from the repo root when this folder became tools/export-legacy (Phase 6A)
const PAGE_SCRIPT = path.join(HERE, 'page_export.js');
const CDN_CACHE = path.join(ROOT, 'build', '3d', '.cache', 'cdn');
const PAGE_ORIGIN = 'http://planner.test';                 // served from disk by a route: no server, a fresh origin, empty storage
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const EXPORTER_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js';
const DEFAULT_SCHEME = 'C · Prow & Lantern';
const STARTER = 'starter';
const EXAG_MIN = 1, EXAG_MAX = 3, EXAG_STEP = 0.25;        // the planner's slider
const VIEWPORT = { width: 640, height: 480 };              // small: the planner keeps rendering while we wait
const SETTLE_POLL_MS = 400, SETTLE_STABLE_POLLS = 4, SETTLE_TIMEOUT_MS = 90_000;
const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const BLOCKED_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

function usage(msg) {
  if (msg) console.error(`error: ${msg}\n`);
  console.error(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(msg ? 2 : 0);
}

function parseCli() {
  let values;
  try {
    ({ values } = parseArgs({ options: { scheme: { type: 'string' }, layout: { type: 'string' }, out: { type: 'string' }, exag: { type: 'string' }, help: { type: 'boolean', short: 'h' } } }));
  } catch (e) { usage(e.message); }
  if (values.help) usage();
  if (values.scheme && values.layout) usage('give --scheme or --layout, not both');
  const exag = values.exag === undefined ? 1 : Number(values.exag);
  if (!Number.isFinite(exag) || exag < EXAG_MIN || exag > EXAG_MAX || Math.abs(exag / EXAG_STEP - Math.round(exag / EXAG_STEP)) > 1e-9) usage(`--exag must be ${EXAG_MIN}..${EXAG_MAX} in steps of ${EXAG_STEP}`);
  let layout = null;
  if (values.layout) {
    const file = path.resolve(values.layout);
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { usage(`cannot read layout ${file}: ${e.message}`); }
    if (!data || !Array.isArray(data.objects)) usage(`layout ${file} has no "objects" array`);
    layout = { file, text: JSON.stringify(data) };
  }
  return { scheme: layout ? null : (values.scheme || DEFAULT_SCHEME), layout, exag, out: path.resolve(values.out || path.join(ROOT, 'build', '3d', 'export')) };
}

const git = (...args) => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };

function loadPlaywright() {
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const bases = [import.meta.url, common && path.join(path.dirname(common), 'package.json')].filter(Boolean);
  for (const base of bases) { try { return createRequire(base)('playwright'); } catch { /* try the next one */ } }
  throw new Error('playwright not found: run `npm install` in tools/export (pins 1.64.1, which reuses the cached Chromium)');
}

// CDN files are cached under build/ so re-runs are offline and byte-identical
async function cdnGet(url) {
  const file = path.join(CDN_CACHE, crypto.createHash('sha1').update(url).digest('hex').slice(0, 12) + '-' + path.basename(new URL(url).pathname));
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(CDN_CACHE, { recursive: true });
  fs.writeFileSync(file, body);
  return body;
}

async function routePage(page, html) {
  await page.route('**/*', async route => {
    const url = route.request().url();
    const host = new URL(url).host;
    if (url.startsWith(PAGE_ORIGIN)) return route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
    if (url === THREE_URL) return route.fulfill({ body: await cdnGet(url), contentType: 'application/javascript' });
    if (BLOCKED_HOSTS.includes(host)) return route.fulfill({ body: '', contentType: 'text/css' });   // no web fonts needed headless
    return route.continue();
  });
}

async function waitForSettle(page, label) {
  const t0 = Date.now();
  let last = null, stable = 0;
  while (stable < SETTLE_STABLE_POLLS) {
    if (Date.now() - t0 > SETTLE_TIMEOUT_MS) throw new Error(`scene did not settle (${label}) within ${SETTLE_TIMEOUT_MS / 1000} s`);
    await page.waitForTimeout(SETTLE_POLL_MS);
    const sig = await page.evaluate(() => window.islandaleExport.signature());
    const busy = JSON.parse(sig)[3];
    stable = sig === last && !busy ? stable + 1 : 0;
    last = sig;
  }
  return JSON.parse(last);
}

const slugify = s => s.normalize('NFKD').replace(/[^\w\s-]/g, ' ').trim().toLowerCase().replace(/[\s_-]+/g, '-');

async function main() {
  const opts = parseCli();
  const t0 = Date.now();
  const html = fs.readFileSync(PLANNER);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: BROWSER_ARGS });
  const pageErrors = [];
  try {
    const page = await (await browser.newContext({ viewport: VIEWPORT })).newPage();   // a new context: empty localStorage
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
    await routePage(page, html);
    await page.goto(`${PAGE_ORIGIN}/index.html`, { waitUntil: 'load' });
    await page.addScriptTag({ content: (await cdnGet(EXPORTER_URL)).toString('utf8') });
    await page.addScriptTag({ path: PAGE_SCRIPT });
    await waitForSettle(page, 'boot');

    let sceneName = STARTER;
    if (opts.layout) { await page.evaluate(t => window.islandaleExport.loadLayoutJson(t), opts.layout.text); sceneName = path.basename(opts.layout.file, '.json'); }
    else if (opts.scheme !== STARTER) sceneName = await page.evaluate(n => window.islandaleExport.loadScheme(n), opts.scheme);
    await waitForSettle(page, 'layout');
    if (opts.exag !== 1) {
      const got = await page.evaluate(v => window.islandaleExport.setExag(v), opts.exag);
      if (got !== opts.exag) throw new Error(`planner refused exag ${opts.exag} (got ${got})`);
      await waitForSettle(page, 'exag');
    }

    const built = await page.evaluate(() => window.islandaleExport.build());
    const slug = slugify(sceneName) + (opts.exag !== 1 ? `-x${opts.exag}` : '');
    const commit = git('rev-parse', 'HEAD');
    const dirty = git('status', '--porcelain', '--', path.relative(ROOT, PLANNER));
    const plannerSha = crypto.createHash('sha256').update(html).digest('hex');
    const source = { scene: sceneName, from: opts.layout ? 'layout' : opts.scheme === STARTER ? 'starter' : 'scheme', commit, indexHtmlDirty: !!dirty, indexHtmlSha256: plannerSha };

    const { json, bin } = readGlb(Buffer.from(built.glb, 'base64'));
    const finished = finishJson({ ...json, asset: { ...json.asset, extras: { source: 'islandale-site-planner index.html', commit } } },
      { scene: sceneName, exag: opts.exag, manifest: `${slug}.manifest.json` });
    const glb = writeGlb(finished, bin);
    const counts = countGlb(finished);

    const manifest = {
      format: 'islandale-export/1', ...source, exag: opts.exag, files: { glb: `${slug}.glb`, manifest: `${slug}.manifest.json` },
      naming: {
        objectNode: '<name> #<id>  (child of Objects; extras {oid, name, t, x, n, rot, floor, grade})',
        meshNode: '<name> #<id>|<part>|m<mi>|e<ei>|<k>  (m/e left out when missing; k = mesh index within the object)',
        meshExtras: 'part (interior walls: partition), partSrc (planner|inferred), oid, objName, t, mi, ei, massKind, wallKind, roofMat, railStyle, color (resolved sRGB hex), matColor (as drawn), opacity, interior, decor, surface, use, bridgeStyle, species, k',
        wallEi: "edge: ei = outline edge (corner ei -> ei+1 of the mass outline); perimeter: one curved wall mesh (ei 0) follows the whole outline",
        colors: 'glTF baseColorFactor and COLOR_0 are linear (from the planner sRGB hex); extras keep the sRGB hex',
      },
      ...built.manifest,
      stats: { ...counts, objects: built.manifest.objects.length, bytes: glb.length, skippedEmpty: built.skipped },
      pageErrors,
    };
    fs.mkdirSync(opts.out, { recursive: true });
    const glbPath = path.join(opts.out, `${slug}.glb`), manPath = path.join(opts.out, `${slug}.manifest.json`);
    fs.writeFileSync(glbPath, glb);
    fs.writeFileSync(manPath, JSON.stringify(manifest, null, 1) + '\n');

    console.log(`scene      ${sceneName}  (${source.from}, exag ${opts.exag})`);
    console.log(`objects    ${manifest.stats.objects}`);
    console.log(`meshes     ${counts.meshes}  (nodes ${counts.nodes}, materials ${counts.materials})`);
    console.log(`triangles  ${counts.triangles.toLocaleString('en-US')}`);
    console.log(`bytes      ${glb.length.toLocaleString('en-US')}  (${(glb.length / 1048576).toFixed(2)} MB)`);
    console.log(`glb        ${glbPath}`);
    console.log(`manifest   ${manPath}`);
    if (pageErrors.length) console.log(`warning    ${pageErrors.length} planner error(s), listed in the manifest's pageErrors`);
    console.log(`time       ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(`export failed: ${e.stack || e.message}`); process.exit(1); });
