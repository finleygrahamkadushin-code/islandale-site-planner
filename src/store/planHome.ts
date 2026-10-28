/**
 * The plan's one home: the repo file data/plans/islandale.plan.json, which
 * Claude Code can edit. While `npm run dev` is running the dev server serves it
 * at /__plan (vite/planFilePlugin.ts) and tells the app when it changes.
 */

export interface HomeRead {
  readonly rev: string
  /** The file's text, or null when there is no plan file yet. */
  readonly text: string | null
}

export type HomeWrite =
  | { readonly ok: true; readonly rev: string }
  | { readonly ok: false; readonly conflict: boolean; readonly rev: string; readonly error: string }

export interface PlanHome {
  readonly label: string
  readonly read: () => Promise<HomeRead>
  readonly write: (text: string, baseRev: string) => Promise<HomeWrite>
  /** Called when the home is changed by someone else. Returns an unsubscribe. */
  readonly onChange: (handler: () => void) => () => void
}

// Kept in step with vite/planFilePlugin.ts.
const ENDPOINT = '/__plan'
const CHANGED_EVENT = 'islandale:plan-file'

/** Remembers which revision of the home this browser last read or wrote. */
export const HOME_REV_KEY = 'islandale-plan.home-rev'

export const repoFileHome: PlanHome = {
  label: 'data/plans/islandale.plan.json',
  read: async () => {
    const res = await fetch(ENDPOINT, { cache: 'no-store' })
    const rev = res.headers.get('ETag') ?? 'none'
    if (res.status === 404) return { rev, text: null }
    if (!res.ok) throw new Error(`the plan file could not be read (${res.status})`)
    return { rev, text: await res.text() }
  },
  write: async (text, baseRev) => {
    const res = await fetch(ENDPOINT, { method: 'PUT', body: text, headers: { 'If-Match': baseRev, 'Content-Type': 'application/json' } })
    const body = (await res.json().catch(() => ({}))) as { rev?: string; error?: string }
    const rev = body.rev ?? res.headers.get('ETag') ?? baseRev
    if (res.ok) return { ok: true, rev }
    return { ok: false, conflict: res.status === 409, rev, error: body.error ?? `HTTP ${res.status}` }
  },
  onChange: (handler) => {
    const hot = import.meta.hot
    if (!hot) return () => {}
    hot.on(CHANGED_EVENT, handler)
    return () => hot.off(CHANGED_EVENT, handler)
  },
}

/** The repo file is reachable only from the dev server. */
export const defaultHome = (): PlanHome | null => (import.meta.env.DEV ? repoFileHome : null)
