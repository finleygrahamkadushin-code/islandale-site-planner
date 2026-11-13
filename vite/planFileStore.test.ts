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
  test('a save that changes only savedAt or the view is not written: the file, its revision and its history stay as they were (decision 5)', async () => {
    const file = (savedAt: string, season: string, name = 'A') => JSON.stringify({ version: 1, app: 'islandale-site-planner', savedAt, plan: { name }, view: { environment: { season } } })
    const store = createPlanFileStore(dir)
    const first = file('2026-11-13T10:00:00.000Z', 'sep')
    const r1 = await store.put(first, NO_FILE_REV)
    if (!r1.ok) throw new Error(r1.error)
    // opening the app again, then moving the sun: the plan is the same
    expect(await store.put(file('2026-11-13T11:00:00.000Z', 'sep'), r1.rev)).toEqual({ ok: true, rev: r1.rev })
    expect(await store.put(file('2026-11-13T11:01:00.000Z', 'jun'), r1.rev)).toEqual({ ok: true, rev: r1.rev })
    expect(await readFile(join(dir, PLAN_FILE_NAME), 'utf8')).toBe(first)
    expect(await readdir(dir)).not.toContain(HISTORY_DIR)
    // a change to the plan is written, with the view as it is then
    const edited = file('2026-11-13T11:02:00.000Z', 'jun', 'B')
    expect(await store.put(edited, r1.rev)).toEqual({ ok: true, rev: revOf(edited) })
    expect(await readFile(join(dir, PLAN_FILE_NAME), 'utf8')).toBe(edited)
  })

  test('an unchanged plan from a tab that read an older revision is not written either, and is told the current one', async () => {
    const store = createPlanFileStore(dir)
    await store.put(plan('A'), NO_FILE_REV)
    const viewOnly = JSON.stringify({ version: 1, plan: { name: 'A' }, view: { labelMode: 'none' } })
    expect(await store.put(viewOnly, 'stale')).toEqual({ ok: true, rev: revOf(plan('A')) })
    expect(await readFile(join(dir, PLAN_FILE_NAME), 'utf8')).toBe(plan('A'))
  })

  test('a newer file version with the same plan is still written', async () => {
    const store = createPlanFileStore(dir)
    await store.put(plan('A'), NO_FILE_REV)
    const v2 = JSON.stringify({ version: 2, plan: { name: 'A' } })
    expect(await store.put(v2, revOf(plan('A')))).toEqual({ ok: true, rev: revOf(v2) })
  })

  test('removing the plan file keeps its last version', async () => {
    const store = createPlanFileStore(dir)
    await store.put(plan('A'), NO_FILE_REV)
    await store.remove()
    expect(await store.read()).toEqual({ rev: NO_FILE_REV, text: null })
    expect(await readdir(join(dir, HISTORY_DIR))).toHaveLength(1)
  })
})

describe('two writers at once (R6.13)', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plan-file-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('two writes based on the same revision: one lands, the other is refused, none is lost unseen', async () => {
    const store = createPlanFileStore(dir)
    const base = await store.put(plan('A'), NO_FILE_REV)
    if (!base.ok) throw new Error(base.error)
    const results = await Promise.all([store.put(plan('From tab 1'), base.rev), store.put(plan('From tab 2'), base.rev)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.status === 409)).toHaveLength(1)
    const winner = results[0].ok ? 'From tab 1' : 'From tab 2'
    expect(JSON.parse(await readFile(join(dir, PLAN_FILE_NAME), 'utf8')).plan.name).toBe(winner)
  })

  test('writes in the same millisecond each keep the version before them', async () => {
    const frozen = new Date('2026-11-10T10:00:00Z')
    const store = createPlanFileStore(dir, () => frozen)
    let rev = NO_FILE_REV
    for (const name of ['A', 'B', 'C']) {
      const r = await store.put(plan(name), rev)
      if (!r.ok) throw new Error(r.error)
      rev = r.rev
    }
    const kept = await readdir(join(dir, HISTORY_DIR))
    const names = await Promise.all(kept.map(async (f) => JSON.parse(await readFile(join(dir, HISTORY_DIR, f), 'utf8')).plan.name))
    expect(names.sort()).toEqual(['A', 'B'])
  })

  test('a file changed on disk while a write is under way is not overwritten', async () => {
    const store = createPlanFileStore(dir, undefined, {
      // Claude saves the file just as the app's write is about to land
      beforeReplace: async () => writeFile(join(dir, PLAN_FILE_NAME), plan('Edited by Claude')),
    })
    const base = await store.put(plan('A'), NO_FILE_REV)
    expect(base).toMatchObject({ ok: false, status: 409 })
    expect(JSON.parse(await readFile(join(dir, PLAN_FILE_NAME), 'utf8')).plan.name).toBe('Edited by Claude')
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })
})
