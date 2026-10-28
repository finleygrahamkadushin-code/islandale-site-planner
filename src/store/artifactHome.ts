import type { PlanHome } from './planHome'

/**
 * The hosted home: one row in the claude.ai artifact's database, which both
 * planners, Claude Code (ArtifactData) and Claude chat can read and write.
 * The row is the plan file itself, as an object, so an edit by Claude is a
 * plain merge into `plan.objects.<id>`. Its revision is a hash of the row's
 * content, not a stored field, so an edit made anywhere changes it.
 */

export const PLAN_DOC = 'plans/islandale'
/** A database row may hold 256 KiB of compact JSON; leave a margin. */
export const MAX_ROW_BYTES = 240_000
const LEASE_MS = 3_000
/** A save that finds another planner's lease waits for it this many times before giving up. */
const LEASE_TRIES = 3
const LEASE_WAIT_MS = 1_200
/** A listener the runtime ends with `unavailable` is started again, at most this many times. */
const RESUBSCRIBE_TRIES = 5
const RESUBSCRIBE_MS = 3_000

// The parts of the artifact runtime's db namespace this file uses (contract 0.2.85, db.d.ts).
interface Snap {
  readonly exists: boolean
  data(): Record<string, unknown> | undefined
  readonly metadata: { readonly hasPendingWrites: boolean }
}
export interface DocRef {
  get(): Promise<Snap>
  set(data: Record<string, unknown>): Promise<void>
  acquire(o: { holder: string; ttlMs?: number }): Promise<{ acquired: boolean }>
  onSnapshot(next: (s: Snap) => void, error?: (e: { code: string; message: string }) => void): () => void
}
export interface DbLike {
  doc(path: string): DocRef
}

/** JSON with object keys sorted, so the same content always hashes the same however the store orders it. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/** A short content hash (cyrb53), as the revision. */
export function rowRev(row: unknown): string {
  const s = canonicalJson(row)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

const NO_ROW = 'none'
const message = (err: unknown) => (err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err))

export interface HostedHomeOptions {
  readonly holder?: string
  readonly wait?: (ms: number) => Promise<void>
}

const realWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const rowBytes = (row: unknown) => new TextEncoder().encode(JSON.stringify(row)).length

export function artifactDbHome(db: DbLike, { holder = `tab-${Math.random().toString(36).slice(2)}`, wait = realWait }: HostedHomeOptions = {}): PlanHome {
  const ref = db.doc(PLAN_DOC)
  /** The revision this page last read or wrote: a snapshot at that revision is not news. */
  let seen: string | null = null

  const acquire = async () => {
    for (let i = 0; i < LEASE_TRIES; i++) {
      if ((await ref.acquire({ holder, ttlMs: LEASE_MS })).acquired) return true
      if (i < LEASE_TRIES - 1) await wait(LEASE_WAIT_MS)
    }
    return false
  }

  return {
    label: 'the hosted home',
    read: async () => {
      const snap = await ref.get()
      const row = snap.exists ? snap.data() : undefined
      seen = row ? rowRev(row) : NO_ROW
      return row ? { rev: seen, text: JSON.stringify(row) } : { rev: NO_ROW, text: null }
    },
    write: async (text, baseRev) => {
      const row = JSON.parse(text) as Record<string, unknown>
      const bytes = rowBytes(row)
      if (bytes > MAX_ROW_BYTES) {
        return { ok: false, conflict: false, rev: baseRev, error: `the plan is ${Math.round(bytes / 1024)} KB, over the hosted home's limit` }
      }
      // a short lease so two tabs or devices never interleave the check and the write. Claude's
      // edits do not take it, so one landing in the moment between the check and the write is
      // still lost: the store has no conditional write (see PLAN.md).
      if (!(await acquire())) return { ok: false, conflict: false, rev: baseRev, error: 'another planner kept saving; this save will go with the next change' }
      const snap = await ref.get()
      const current = snap.exists ? snap.data() : undefined
      const rev = current ? rowRev(current) : NO_ROW
      if (rev !== baseRev) return { ok: false, conflict: true, rev, error: 'the hosted home changed' }
      const next = rowRev(row)
      seen = next
      try {
        await ref.set(row)
      } catch (err) {
        seen = rev
        return { ok: false, conflict: false, rev, error: message(err) }
      }
      return { ok: true, rev: next }
    },
    onChange: (handler) => {
      let off: () => void = () => {}
      let stopped = false
      let tries = 0
      const subscribe = () => {
        off = ref.onSnapshot(
          (snap) => {
            tries = 0
            // before opening has read the row there is nothing to compare with; opening decides
            if (snap.metadata.hasPendingWrites || seen === null) return
            const row = snap.exists ? snap.data() : undefined
            // only a revision this page has not read or written is someone else's change
            if ((row ? rowRev(row) : NO_ROW) !== seen) handler()
          },
          (err) => {
            console.error('[hosted home] stopped listening for changes', err.code, err.message)
            if (stopped || err.code !== 'unavailable' || tries++ >= RESUBSCRIBE_TRIES) return
            void wait(RESUBSCRIBE_MS).then(() => !stopped && subscribe())
          },
        )
      }
      subscribe()
      return () => {
        stopped = true
        off()
      }
    },
  }
}

interface ClaudeRuntime {
  use(name: string): Promise<unknown>
}

/** Whether this page runs inside a claude.ai artifact, where findArtifactDb has to wait for the runtime. */
export const findArtifactDbLikely = (win: { claude?: ClaudeRuntime } = window as never): boolean => typeof win.claude?.use === 'function'

/** The artifact runtime's db, when this page runs as the hosted home on claude.ai; otherwise null. */
export async function findArtifactDb(win: { claude?: ClaudeRuntime } = window as never): Promise<DbLike | null> {
  if (!findArtifactDbLikely(win) || !win.claude) return null
  try {
    return ((await win.claude.use('db')) as DbLike | null) ?? null
  } catch (err) {
    console.error('[hosted home] the database is not available', err)
    return null
  }
}
