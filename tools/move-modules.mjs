#!/usr/bin/env node
/**
 * Move TypeScript modules and rewrite every relative import that points at them.
 *
 *   node tools/move-modules.mjs moves.json [--dry]
 *
 * moves.json maps repo-relative file paths, old to new:
 *   { "src/buildings/rails.ts": "src/buildings/rails/rails.ts", ... }
 *
 * Every .ts/.tsx/.mjs/.js file under src/, e2e/ and scripts/ is scanned, and
 * its relative specifiers (static imports and exports, side-effect imports,
 * dynamic import(), vi.mock()) are re-pointed from the file's new location
 * to the target's new location. The files are moved with `git mv`, so history
 * follows them. Nothing is written if any move source is missing or any
 * destination already exists.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['src', 'e2e', 'scripts']
const CODE_EXT = /\.(ts|tsx|mjs|js)$/
const RESOLVE_EXTS = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx']
const SPECIFIER = /((?:\bfrom|\bimport|\bimport\(|\bvi\.mock\()\s*)(['"])(\.{1,2}\/[^'"]+)\2/g

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (name === 'node_modules') return []
    if (statSync(p).isDirectory()) return walk(p)
    return CODE_EXT.test(name) ? [p] : []
  })
}

/**
 * Whether a file exists with exactly this name. macOS disks ignore case, so
 * existsSync('Foundation.ts') is true for foundation.ts; the bundler and tsc
 * treat those as different modules, so compare against the real entries.
 */
function isExactFile(p) {
  const dir = dirname(p)
  return existsSync(dir) && readdirSync(dir).includes(basename(p)) && statSync(p).isFile()
}

/** The file a specifier names (repo-relative) and the extension it left off, or null. */
function resolveTarget(fromFile, spec) {
  const [bare, query = ''] = spec.split('?')
  const base = resolve(ROOT, dirname(fromFile), bare)
  const ext = RESOLVE_EXTS.find((e) => isExactFile(base + e))
  return ext === undefined ? null : { file: relative(ROOT, base + ext), ext, query }
}

/** Two moved files whose paths differ only in case, which a case-insensitive disk can't hold apart. */
function caseClashes(moves) {
  const stem = (p) => p.replace(CODE_EXT, '').toLowerCase()
  const kept = SCAN_DIRS.flatMap(walk).filter((f) => !(f in moves))
  const all = [...kept, ...Object.values(moves)]
  return Object.values(moves).flatMap((to) =>
    all.filter((other) => other !== to && stem(other) === stem(to)).map((other) => `case clash: ${to} vs ${other}`),
  )
}

/** A relative specifier from one repo-relative file to another, in the original's style. */
function specifierTo(fromFile, target, { ext, query }) {
  let p = relative(dirname(fromFile), target.slice(0, target.length - ext.length))
  if (!p.startsWith('.')) p = './' + p
  return query ? `${p}?${query}` : p
}

function checkMoves(moves) {
  const problems = Object.entries(moves).flatMap(([from, to]) => [
    ...(existsSync(from) ? [] : [`missing source: ${from}`]),
    ...(existsSync(to) ? [`destination exists: ${to}`] : []),
  ]).concat(caseClashes(moves))
  if (problems.length) throw new Error(problems.join('\n'))
}

function planEdits(moves) {
  const newPath = (f) => moves[f] ?? f
  const unresolved = []
  const edits = SCAN_DIRS.flatMap(walk).flatMap((file) => {
    const text = readFileSync(file, 'utf8')
    const next = text.replace(SPECIFIER, (whole, lead, quote, spec) => {
      const hit = resolveTarget(file, spec)
      if (!hit) {
        unresolved.push(`${file}: ${spec}`)
        return whole
      }
      const rewritten = specifierTo(newPath(file), newPath(hit.file), hit)
      return rewritten === spec ? whole : lead + quote + rewritten + quote
    })
    return next === text ? [] : [[file, next]]
  })
  return { edits, unresolved }
}

function main() {
  const [mapPath, flag] = process.argv.slice(2)
  if (!mapPath) throw new Error('usage: node tools/move-modules.mjs moves.json [--dry]')
  const moves = JSON.parse(readFileSync(mapPath, 'utf8'))
  checkMoves(moves)

  const { edits, unresolved } = planEdits(moves)
  unresolved.forEach((u) => console.warn(`unresolved: ${u}`))
  console.log(`${Object.keys(moves).length} moves, ${edits.length} files with import changes, ${unresolved.length} unresolved`)
  if (flag === '--dry') return

  edits.forEach(([file, next]) => writeFileSync(file, next))
  Object.entries(moves).forEach(([from, to]) => {
    mkdirSync(dirname(to), { recursive: true })
    execFileSync('git', ['mv', from, to])
  })
}

main()
