import type { Plan, PlanObject } from './types'

/** One saved copy of the plan, kept so it can be restored from the History menu. */
export interface HistoryEntry {
  readonly savedAt: string
  /** What changed since the previous entry, e.g. "moved Gathering prow". */
  readonly label: string
  /** The PlanFile JSON, exactly as autosave wrote it. */
  readonly text: string
}

export const HISTORY_KEY = 'islandale-plan.history'
export const HISTORY_LIMIT = 20
export const HISTORY_MIN_GAP_MS = 60_000

export const OPENED_LABEL = 'opened'

/**
 * Add an entry, newest first, and keep the newest HISTORY_LIMIT. Saves less
 * than a minute apart share one entry, except the entry made when the plan is
 * opened (`force`), which is kept as it was so a bad edit right after opening
 * can still be undone from History.
 */
export function addToHistory(
  entries: readonly HistoryEntry[],
  entry: HistoryEntry,
  force = false,
): readonly HistoryEntry[] {
  const newest = entries[0]
  const opened = newest?.label.startsWith(OPENED_LABEL) ?? false
  // Opened again with no edits since the last opening: one entry is enough.
  if (force && opened) return [entry, ...entries.slice(1)]
  const recent = newest && Date.parse(entry.savedAt) - Date.parse(newest.savedAt) < HISTORY_MIN_GAP_MS
  if (!force && recent && !opened) {
    // The newest entry takes the latest plan but keeps its time.
    return [{ savedAt: newest.savedAt, text: entry.text, label: mergeLabels(newest.label, entry.label) }, ...entries.slice(1)]
  }
  return [entry, ...entries].slice(0, HISTORY_LIMIT)
}

function mergeLabels(a: string, b: string): string {
  if (!a || a === b) return b
  if (!b) return a
  return 'several changes'
}

/** A short description of what changed between two plans. */
export function describeChange(prev: Plan | null, next: Plan): string {
  if (!prev) return OPENED_LABEL
  if (prev.schemeId !== next.schemeId && next.schemeId) return `loaded Scheme ${next.schemeId}`
  const ids = new Set([...Object.keys(prev.objects), ...Object.keys(next.objects)])
  const changes: string[] = []
  for (const id of ids) {
    const a = prev.objects[id]
    const b = next.objects[id]
    if (a === b) continue
    if (!a) changes.push(`added ${b.name}`)
    else if (!b) changes.push(`deleted ${a.name}`)
    else if (JSON.stringify(a) !== JSON.stringify(b)) changes.push(`${verb(a, b)} ${b.name}`)
  }
  if (changes.length === 0) return prev.order.join() === next.order.join() ? 'view settings' : 'reordered objects'
  if (changes.length === 1) return changes[0]
  return `changed ${changes.length} objects`
}

function verb(a: PlanObject, b: PlanObject): string {
  if (a.position.x !== b.position.x || a.position.n !== b.position.n) return 'moved'
  if (a.rotation !== b.rotation) return 'rotated'
  if (a.locked !== b.locked) return b.locked ? 'locked' : 'unlocked'
  if (a.hidden !== b.hidden) return b.hidden ? 'hid' : 'showed'
  if (a.name !== b.name) return 'renamed'
  return 'edited'
}

/** Keep only well-formed entries from whatever was stored. */
export function readHistory(raw: unknown): readonly HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (e): e is HistoryEntry =>
      typeof e === 'object' &&
      e !== null &&
      typeof e.savedAt === 'string' &&
      typeof e.label === 'string' &&
      typeof e.text === 'string',
  )
}
