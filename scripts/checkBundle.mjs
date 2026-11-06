// Fails when a built chunk other than three.js passes 500 kB (4E). Run after `vite build`:
//   node scripts/checkBundle.mjs [distDir]
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const LIMIT_BYTES = 500 * 1000
/** three.js is one library that can't be split; it's cached on its own. */
export const ALLOWED = [/^three-[\w-]+\.js$/]

/** The chunks over the limit that aren't allowed, as `[name, bytes]`. */
export function oversized(files, limit = LIMIT_BYTES, allowed = ALLOWED) {
  return files.filter(([name, bytes]) => name.endsWith('.js') && bytes > limit && !allowed.some((re) => re.test(name)))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = join(process.argv[2] ?? 'dist', 'assets')
  const files = readdirSync(dir).map((f) => [f, statSync(join(dir, f)).size])
  const bad = oversized(files)
  for (const [f, b] of bad) console.error(`${f}: ${(b / 1000).toFixed(0)} kB is over ${LIMIT_BYTES / 1000} kB`)
  if (bad.length) process.exit(1)
  console.log(`bundle ok: ${files.filter(([f]) => f.endsWith('.js')).length} chunks, none over ${LIMIT_BYTES / 1000} kB but three.js`)
}
