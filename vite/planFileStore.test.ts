import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { HISTORY_DIR, HISTORY_KEEP, NO_FILE_REV, PLAN_FILE_NAME, createPlanFileStore, revOf } from './planFileStore'

const plan = (name: string) => JSON.stringify({ version: 1, plan: { name } })

describe('the plan file on disk', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plan-file-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('a missing file reads as revision "none", and the first write needs that revision', async () => {
    const store = createPlanFileStore(dir)
    expect(await store.read()).toEqual({ rev: NO_FILE_REV, text: null })
    expect(await store.put(plan('A'), 'wrong')).toMatchObject({ ok: false, status: 409 })
    expect(await store.put(plan('A'), NO_FILE_REV)).toEqual({ ok: true, rev: revOf(plan('A')) })
    expect(await readFile(join(dir, PLAN_FILE_NAME), 'utf8')).toBe(plan('A'))
  })

  test('a write based on a stale revision is refused and changes nothing', async () => {
    const store = createPlanFileStore(dir)
    await store.put(plan('A'), NO_FILE_REV)
    await writeFile(join(dir, PLAN_FILE_NAME), plan('Edited by Claude'))
    const result = await store.put(plan('From a stale tab'), revOf(plan('A')))
    expect(result).toMatchObject({ ok: false, status: 409, rev: revOf(plan('Edited by Claude')) })
    expect(await readFile(join(dir, PLAN_FILE_NAME), 'utf8')).toBe(plan('Edited by Claude'))
  })

  test('text that is not a plan is refused and leaves the file whole', async () => {
    const store = createPlanFileStore(dir)
    await store.put(plan('A'), NO_FILE_REV)
    expect(await store.put('{"version":1,', revOf(plan('A')))).toMatchObject({ ok: false, status: 400 })
    expect(await store.put('{"plan":{}}', revOf(plan('A')))).toMatchObject({ ok: false, status: 400 })
    expect(await readFile(join(dir, PLAN_FILE_NAME), 'utf8')).toBe(plan('A'))
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  test('each write keeps the previous version, pruned to the newest 50', async () => {
    let t = Date.parse('2026-10-27T10:00:00Z')
    const store = createPlanFileStore(dir, () => new Date((t += 1000)))
    let rev = NO_FILE_REV
    for (let i = 0; i < HISTORY_KEEP + 5; i++) {
      const r = await store.put(plan(`v${i}`), rev)
      if (!r.ok) throw new Error(r.error)
      rev = r.rev
    }
    const kept = (await readdir(join(dir, HISTORY_DIR))).sort()
    expect(kept).toHaveLength(HISTORY_KEEP)
    expect(JSON.parse(await readFile(join(dir, HISTORY_DIR, kept.at(-1)!), 'utf8')).plan.name).toBe(`v${HISTORY_KEEP + 3}`)
  })
  test('removing the plan file keeps its last version', async () => {
    const store = createPlanFileStore(dir)
    await store.put(plan('A'), NO_FILE_REV)
    await store.remove()
    expect(await store.read()).toEqual({ rev: NO_FILE_REV, text: null })
    expect(await readdir(join(dir, HISTORY_DIR))).toHaveLength(1)
  })
})
