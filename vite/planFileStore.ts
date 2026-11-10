import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The plan's home on disk: data/plans/islandale.plan.json. Claude Code edits
 * it directly; the dev server reads and writes it for the app. Every write is
 * atomic (temp file, then rename), keeps the previous version in .history,
 * and must name the revision it was based on, so a stale tab cannot overwrite
 * someone else's edit.
 */

export const PLAN_FILE_NAME = 'islandale.plan.json'
export const HISTORY_DIR = '.history'
export const HISTORY_KEEP = 50
/** The revision of a plan file that does not exist yet. */
export const NO_FILE_REV = 'none'

export interface PlanFileRead {
  readonly rev: string
  readonly text: string | null
}

export type PutResult =
  | { readonly ok: true; readonly rev: string }
  | { readonly ok: false; readonly status: 400 | 409; readonly error: string; readonly rev: string }

export const revOf = (text: string): string => createHash('sha1').update(text).digest('hex').slice(0, 16)

export interface PlanFileStoreHooks {
  /** Runs after the new text is written aside, just before the revision is checked again (tests use it). */
  readonly beforeReplace?: () => Promise<void>
}

export function createPlanFileStore(dir: string, now: () => Date = () => new Date(), hooks: PlanFileStoreHooks = {}) {
  const file = join(dir, PLAN_FILE_NAME)
  const historyDir = join(dir, HISTORY_DIR)
  /** Gives temp and history files names no other write in the same millisecond can share. */
  let seq = 0
  /** One write at a time, so two tabs' writes based on the same revision cannot both pass the check. */
  let queue: Promise<unknown> = Promise.resolve()
  const oneAtATime = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job)
    queue = run.catch(() => undefined)
    return run
  }

  const read = async (): Promise<PlanFileRead> => {
    try {
      const text = await readFile(file, 'utf8')
      return { rev: revOf(text), text }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { rev: NO_FILE_REV, text: null }
      throw err
    }
  }

  const keepPrevious = async (text: string) => {
    await mkdir(historyDir, { recursive: true })
    // the time first, so the names sort oldest first; the sequence keeps two writes in one millisecond apart
    await writeFile(join(historyDir, `${now().toISOString().replace(/[:.]/g, '-')}-${String(++seq).padStart(6, '0')}.json`), text)
    const old = (await readdir(historyDir)).filter((f) => f.endsWith('.json')).sort()
    for (const f of old.slice(0, Math.max(0, old.length - HISTORY_KEEP))) await rm(join(historyDir, f))
  }

  const changed = (rev: string): PutResult => ({ ok: false, status: 409, error: 'The plan file changed since this copy was read.', rev })

  /** Write the plan if `baseRev` is still the file's revision. */
  const put = (text: string, baseRev: string | null): Promise<PutResult> =>
    oneAtATime(async () => {
      const current = await read()
      const problem = checkPlanText(text)
      if (problem) return { ok: false, status: 400, error: problem, rev: current.rev }
      if (baseRev !== current.rev) return changed(current.rev)
      await mkdir(dir, { recursive: true })
      const temp = `${file}.${process.pid}.${Date.now()}.${++seq}.tmp`
      await writeFile(temp, text)
      try {
        await hooks.beforeReplace?.()
        // checked again: someone may have saved the file while the new text was written aside
        const again = await read()
        if (again.rev !== current.rev) {
          await rm(temp, { force: true })
          return changed(again.rev)
        }
        if (current.text !== null) await keepPrevious(current.text)
        await rename(temp, file)
      } catch (err) {
        await rm(temp, { force: true })
        throw err
      }
      return { ok: true, rev: revOf(text) }
    })

  /** Remove the plan file (its last version stays in .history). Used by the end-to-end tests. */
  const remove = (): Promise<void> =>
    oneAtATime(async () => {
      const current = await read()
      if (current.text === null) return
      await keepPrevious(current.text)
      await rm(file)
    })

  return { file, read, put, remove }
}

/** A cheap check that the text is a plan file; full validation happens in the app. */
export function checkPlanText(text: string): string | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return 'The plan is not JSON.'
  }
  if (typeof raw !== 'object' || raw === null) return 'The plan must be an object.'
  const r = raw as Record<string, unknown>
  if (typeof r.version !== 'number') return 'The plan has no version.'
  if (typeof r.plan !== 'object' || r.plan === null) return 'The plan file has no plan.'
  return null
}
