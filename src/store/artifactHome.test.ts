import { describe, expect, it } from 'vitest'
import { artifactDbHome, canonicalJson, findArtifactDb, MAX_ROW_BYTES, rowRev, type DbLike } from './artifactHome'

const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * An in-memory stand-in for the artifact runtime's db that behaves like the real one where it
 * matters: a store that reorders keys, snapshots delivered asynchronously, an own write echoed
 * first as pending and then confirmed, and leases held per holder until a fake clock passes them.
 */
function fakeDb() {
  let row: Record<string, unknown> | undefined
  let now = 0
  let lease: { holder: string; until: number } | null = null
  let failNextSet = false
  const listeners: { next: (s: ReturnType<typeof snap>) => void; error?: (e: { code: string; message: string }) => void }[] = []
  const reorder = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).reverse())
  const snap = (pending = false) => ({ exists: !!row, data: () => row, metadata: { hasPendingWrites: pending } })
  const deliver = (pending = false) => {
    const s = snap(pending)
    listeners.forEach((l) => setTimeout(() => l.next(s), 0))
  }
  const db: DbLike = {
    doc: () => ({
      get: async () => snap(),
      set: async (d) => {
        if (failNextSet) {
          failNextSet = false
          throw { code: 'quota_exceeded', message: 'full' }
        }
        row = reorder(JSON.parse(JSON.stringify(d)))
        deliver(true)
        deliver(false)
      },
      acquire: async ({ holder, ttlMs = 30_000 }) => {
        if (lease && lease.until > now && lease.holder !== holder) return { acquired: false }
        lease = { holder, until: now + ttlMs }
        return { acquired: true }
      },
      onSnapshot: (next, error) => {
        const l = { next, error }
        listeners.push(l)
        setTimeout(() => next(snap()), 0)
        return () => listeners.splice(listeners.indexOf(l), 1)
      },
    }),
  }
  return {
    db,
    /** An edit from outside, as Claude makes through ArtifactData. */
    edit: (r: Record<string, unknown>) => {
      row = r
      deliver()
    },
    /** Another device takes the lease. */
    otherLease: (ms: number) => (lease = { holder: 'other', until: now + ms }),
    /** The waiting the home does between lease attempts moves the clock. */
    wait: async (ms: number) => void (now += ms),
    failNextSet: () => (failNextSet = true),
    /** The runtime ends every listener, as when its bridge stops answering. */
    kill: () => listeners.splice(0).forEach((l) => l.error?.({ code: 'unavailable', message: 'bridge' })),
    listenerCount: () => listeners.length,
    row: () => row,
  }
}

const file = (name: string) => JSON.stringify({ version: 1, app: 'islandale-site-planner', savedAt: 't', plan: { name }, view: {} }, null, 2)

describe('artifactDbHome', () => {
  it('reads nothing from an empty database', async () => {
    const home = artifactDbHome(fakeDb().db)
    expect(await home.read()).toEqual({ rev: 'none', text: null })
  })

  it('writes the first plan, then reads it back with the same revision whatever order the store keeps keys in', async () => {
    const f = fakeDb()
    const home = artifactDbHome(f.db, { wait: f.wait })
    const w = await home.write(file('a'), 'none')
    expect(w.ok).toBe(true)
    const r = await home.read()
    expect(w.ok && r.rev).toBe(w.ok ? w.rev : '')
    expect(JSON.parse(r.text ?? '')).toEqual(JSON.parse(file('a')))
  })

  it('refuses a write based on an old revision, so an edit by Claude is never overwritten', async () => {
    const f = fakeDb()
    const home = artifactDbHome(f.db, { wait: f.wait })
    const first = await home.write(file('a'), 'none')
    f.edit(JSON.parse(file('edited by Claude')))
    const stale = await home.write(file('b'), first.ok ? first.rev : '')
    expect(stale).toMatchObject({ ok: false, conflict: true })
    expect((f.row()?.plan as { name: string }).name).toBe('edited by Claude')
  })

  it('waits out another planner’s short lease, and gives up without writing if it is held throughout', async () => {
    const f = fakeDb()
    const home = artifactDbHome(f.db, { wait: f.wait })
    f.otherLease(2_000)
    expect((await home.write(file('a'), 'none')).ok).toBe(true)
    f.otherLease(60_000)
    const w = await home.write(file('b'), rowRev(f.row()))
    expect(w).toMatchObject({ ok: false, conflict: false })
    expect((f.row()?.plan as { name: string }).name).toBe('a')
  })

  it('renews its own lease, so saves in quick succession all go through', async () => {
    const f = fakeDb()
    const home = artifactDbHome(f.db, { wait: f.wait })
    const a = await home.write(file('a'), 'none')
    const b = await home.write(file('b'), a.ok ? a.rev : '')
    expect(b.ok).toBe(true)
  })

  it('measures the compact row, so an indented plan that fits is accepted and one too big is refused', async () => {
    const f = fakeDb()
    const home = artifactDbHome(f.db, { wait: f.wait })
    // about 150 KB compact; well over the limit once indented
    const wide = JSON.stringify({ plan: { rows: Array.from({ length: 9_000 }, (_, i) => ({ i, a: 1, b: 2 })) } }, null, 2)
    expect(wide.length).toBeGreaterThan(MAX_ROW_BYTES)
    expect((await home.write(wide, 'none')).ok).toBe(true)
    const big = JSON.stringify({ plan: { pad: 'x'.repeat(MAX_ROW_BYTES) } })
    expect(await home.write(big, rowRev(f.row()))).toMatchObject({ ok: false, conflict: false })
  })

  it('reports a write the store refuses, and still treats the old row as current', async () => {
    const f = fakeDb()
    const home = artifactDbHome(f.db, { wait: f.wait })
    const a = await home.write(file('a'), 'none')
    f.failNextSet()
    expect(await home.write(file('b'), a.ok ? a.rev : '')).toMatchObject({ ok: false, conflict: false, error: 'full' })
    let calls = 0
    home.onChange(() => calls++)
    await tick()
    expect(calls).toBe(0)
  })

  it('reports only other people’s edits: not its own writes, their confirmation, or the row it already read', async () => {
    const f = fakeDb()
    const home = artifactDbHome(f.db, { wait: f.wait })
    let calls = 0
    const off = home.onChange(() => calls++)
    await home.read()
    await home.write(file('a'), 'none')
    await tick()
    expect(calls).toBe(0)
    f.edit(JSON.parse(file('b')))
    await tick()
    expect(calls).toBe(1)
    off()
    f.edit(JSON.parse(file('c')))
    await tick()
    expect(calls).toBe(1)
  })

  it('reports an edit that lands before the first snapshot arrives, once the row has been read', async () => {
    const f = fakeDb()
    const home = artifactDbHome(f.db, { wait: f.wait })
    await home.read()
    let calls = 0
    home.onChange(() => calls++)
    f.edit(JSON.parse(file('Claude, early')))
    await tick()
    expect(calls).toBeGreaterThanOrEqual(1)
  })

  it('stays quiet until opening has read the row', async () => {
    const f = fakeDb()
    f.edit(JSON.parse(file('a')))
    let calls = 0
    artifactDbHome(f.db, { wait: f.wait }).onChange(() => calls++)
    await tick()
    expect(calls).toBe(0)
  })

  it('starts listening again when the runtime drops the listener', async () => {
    const f = fakeDb()
    const home = artifactDbHome(f.db, { wait: f.wait })
    await home.read()
    let calls = 0
    home.onChange(() => calls++)
    f.kill()
    await tick()
    expect(f.listenerCount()).toBe(1)
    f.edit(JSON.parse(file('after the drop')))
    await tick()
    expect(calls).toBeGreaterThanOrEqual(1)
  })
})

describe('revisions', () => {
  it('ignore key order and change with the content', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}')
    expect(rowRev({ a: 1, b: 2 })).toBe(rowRev({ b: 2, a: 1 }))
    expect(rowRev({ a: 1 })).not.toBe(rowRev({ a: 2 }))
  })
})

describe('findArtifactDb', () => {
  it('is null outside claude.ai and when the runtime grants no db', async () => {
    expect(await findArtifactDb({})).toBeNull()
    expect(await findArtifactDb({ claude: { use: async () => null } })).toBeNull()
    expect(await findArtifactDb({ claude: { use: async () => Promise.reject(new Error('x')) } })).toBeNull()
  })
})
