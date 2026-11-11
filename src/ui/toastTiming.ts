/**
 * How long a toast stays, read from its words. Toasts are the app's one
 * message channel, and the store sends only text, so the kind is told by
 * the phrasing its senders use:
 * - problem: the plan or its save is in trouble (could not read, save or
 *   import; editing is off). Stays until dismissed.
 * - refused: an edit that was not made (locked, not possible here). Stays
 *   long enough to read twice.
 * - info: news of what just happened. Stays for its length.
 */

export type ToastKind = 'problem' | 'refused' | 'info'

/** A refused edit stays this long, ms. */
export const REFUSED_MS = 10_000
/** News stays at least this long, ms, and longer for longer text. */
export const TOAST_MIN_MS = 4_000
export const TOAST_MAX_MS = 10_000
/** Reading time per character of news, ms (about 200 words a minute). */
const MS_PER_CHAR = 60

const PROBLEM = /could not|couldn't|failed|editing is off|read-only|another tab/i
const REFUSED =
  /\b(is|are) locked\b|^locked objects|\bno one-click\b|^select two\b|^nothing selected\b|\bworks on\b|\bhas no\b|\bat most\b|\bstay; pick\b|^no route\b|^no driveway\b|^no walks\b|^esc to select\b/i

export function toastKind(text: string): ToastKind {
  if (PROBLEM.test(text)) return 'problem'
  if (REFUSED.test(text)) return 'refused'
  return 'info'
}

/** How long the toast stays, ms, or null when it stays until dismissed. */
export function toastDuration(text: string): number | null {
  const kind = toastKind(text)
  if (kind === 'problem') return null
  if (kind === 'refused') return REFUSED_MS
  return Math.min(TOAST_MAX_MS, Math.max(TOAST_MIN_MS, text.length * MS_PER_CHAR))
}
