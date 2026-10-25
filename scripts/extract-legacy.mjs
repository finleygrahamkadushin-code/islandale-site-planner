// Extracts the Islandale site data and the scheme library from the legacy
// single-file planner into JSON under data/islandale/.
//
// GRID, PARCEL and LOT_SQFT are one-line JSON-ish constants and are parsed
// directly. The schemes are built by code (a literal for A-C, then IIFEs that
// derive C2-C4 and push D-I), so that region of the file is run in a Node vm
// sandbox with only Math and console available, and the resulting array is
// captured. Nothing else from the legacy file is executed.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import crypto from 'node:crypto'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const legacyPath = path.join(root, 'legacy', 'islandale-planner.html')
const outArg = process.argv.indexOf('--out')
const outDir = outArg >= 0 && process.argv[outArg + 1]
  ? path.resolve(process.argv[outArg + 1])
  : path.join(root, 'data', 'islandale')

const html = fs.readFileSync(legacyPath, 'utf8')
const lines = html.split('\n')
const sourceSha256 = crypto.createHash('sha256').update(html).digest('hex')

function oneLineConst(name) {
  const re = new RegExp(`^const ${name}\\s*=\\s*(.*);\\s*$`)
  const line = lines.find((l) => re.test(l))
  if (!line) throw new Error(`const ${name} not found in legacy file`)
  return line.match(re)[1]
}

function findLine(pred, from = 0) {
  const i = lines.findIndex((l, idx) => idx >= from && pred(l))
  if (i < 0) throw new Error('marker not found')
  return i
}

// --- site data -------------------------------------------------------------
const grid = JSON.parse(oneLineConst('GRID'))
const parcel = JSON.parse(oneLineConst('PARCEL'))
const lotSqFt = Number(oneLineConst('LOT_SQFT'))
if (!Number.isFinite(lotSqFt)) throw new Error('LOT_SQFT is not a number')
// `const SHORE_START = 4, SHORE_END = 122;` — ring edges i..i+1 with
// SHORE_START <= i <= SHORE_END are the shoreline (OHWM) edges.
const shoreLine = lines.find((l) => /^const SHORE_START\s*=/.test(l))
if (!shoreLine) throw new Error('SHORE_START not found in legacy file')
const shoreMatch = shoreLine.match(/SHORE_START\s*=\s*(\d+),\s*SHORE_END\s*=\s*(\d+)/)
if (!shoreMatch) throw new Error('could not parse SHORE_START / SHORE_END')
const shorelineEdges = { first: Number(shoreMatch[1]), last: Number(shoreMatch[2]) }

// --- schemes ---------------------------------------------------------------
// The scheme library is one contiguous block: a helper preamble (FL, WALK,
// SITEWORK, STAIR, colours...), the SCHEMES literal, then one try/catch per
// derived or added scheme. It needs only the FT / M2FT unit constants from
// elsewhere in the file.
const unitsLine = findLine((l) => /^const FT = 0\.3048, M2FT = /.test(l))
const start = findLine((l) => /^\/\/ -+ Rivera-Liu compound schemes/.test(l))
const schemesLine = findLine((l) => /^const SCHEMES\s*=\s*\[/.test(l), start)
const uiLine = findLine((l) => /const box=\$\('schemes'\)/.test(l), schemesLine)
// Each scheme file is wrapped in `try{ ... }catch(e){ console.error("[scheme] ...") }`;
// the region ends at the last such catch line before the scheme-list UI code.
let end = -1
for (let i = uiLine - 1; i > start; i--) {
  if (/^\}catch\(e\)\{ console\.error\("\[scheme\] /.test(lines[i])) { end = i; break }
}
if (end < 0) throw new Error('could not find the end of the scheme-building code')

const code = lines[unitsLine] + '\n' + lines.slice(start, end + 1).join('\n') + '\n;__capture(SCHEMES);\n'
let schemes = null
const legacyErrors = []
const sandbox = {
  Math,
  // The legacy try/catch blocks swallow failures into console.error; collect
  // them so a missing dependency fails the extraction instead of dropping a scheme.
  console: { log() {}, warn() {}, error: (...a) => legacyErrors.push(a) },
  __capture: (v) => { schemes = v },
}
vm.createContext(sandbox)
vm.runInContext(code, sandbox, { filename: 'legacy-schemes.js', lineOffset: start - 1 })
if (legacyErrors.length) {
  for (const e of legacyErrors) console.error('[legacy]', ...e)
  throw new Error(`${legacyErrors.length} scheme block(s) failed inside the legacy code`)
}
if (!Array.isArray(schemes) || schemes.length === 0) throw new Error('no schemes captured')

function schemeId(name) {
  const m = name.match(/^([A-Z]\d?)\s*·/)
  if (!m) throw new Error(`cannot derive an id from scheme name "${name}"`)
  return m[1]
}

const schemeList = schemes.map((s) => ({ id: schemeId(s.name), ...JSON.parse(JSON.stringify(s)) }))
const ids = schemeList.map((s) => s.id)
if (new Set(ids).size !== ids.length) throw new Error(`duplicate scheme ids: ${ids.join(', ')}`)

// --- write -----------------------------------------------------------------
fs.mkdirSync(outDir, { recursive: true })
const meta = { extractedFrom: 'legacy/islandale-planner.html', sourceSha256 }

const terrain = {
  meta: {
    ...meta,
    source: 'USGS 3DEP 1/9 arc-second LiDAR DEM, sampled every 2 m',
    datum: 'NAVD88',
    units: { spacing: 'm', z: 'ft' },
  },
  lon0: grid.lon0,
  lat0: grid.lat0,
  metresPerDegLon: grid.mlon,
  metresPerDegLat: grid.mlat,
  spacing: grid.sp,
  nx: grid.nx,
  ny: grid.ny,
  z: grid.z,
}
const parcelOut = {
  meta: {
    ...meta,
    source: 'San Juan County assessor via the WDFW statewide parcel service',
    units: { ring: 'm (local east/north from the grid origin)', lotSqFt: 'sq ft' },
    shorelineEdges: 'ring edge i (from ring[i] to ring[i+1]) is shoreline when first <= i <= last',
  },
  ring: parcel.ring,
  lotSqFt,
  shorelineEdges,
}
const write = (name, obj) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(obj) + '\n')
write('terrain.json', terrain)
write('parcel.json', parcelOut)
write('schemes.json', { meta, schemes: schemeList })

console.log(`terrain ${grid.nx}x${grid.ny} @ ${grid.sp} m, ${grid.z.length} samples`)
console.log(`parcel ${parcel.ring.length} vertices, ${lotSqFt} sq ft`)
console.log(`schemes ${schemeList.length}: ${ids.join(', ')}`)
