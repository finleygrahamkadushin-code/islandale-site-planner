import { describe, expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

describe('extract-legacy.mjs', () => {
  test('re-extracting the legacy file reproduces the committed JSON exactly', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'islandale-extract-'))
    try {
      execFileSync(process.execPath, [path.join(root, 'scripts', 'extract-legacy.mjs'), '--out', out], {
        cwd: root,
        stdio: 'pipe',
      })
      for (const name of ['terrain.json', 'parcel.json', 'schemes.json']) {
        const fresh = fs.readFileSync(path.join(out, name), 'utf8')
        const committed = fs.readFileSync(path.join(root, 'data', 'islandale', name), 'utf8')
        expect(fresh, `${name} drifted from legacy/islandale-planner.html; run npm run extract`).toBe(committed)
      }
    } finally {
      fs.rmSync(out, { recursive: true, force: true })
    }
  }, 30_000)
})
