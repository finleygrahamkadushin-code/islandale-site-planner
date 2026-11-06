import { useSplash } from '../present/viewState'

/**
 * The screens that load on first use (4E), fetched quietly once the first
 * frame is drawn, so they're ready before anyone clicks.
 */
export const loadSheets = () => import('../export/sheets/DrawingSheets')
export const loadInteriorEditor = () => import('../interiors/editor/InteriorEditor')
export const loadCommandMenu = () => import('../layout/CommandMenu')

/** Wait this long after the first frame when the browser has no idle callback, ms. */
const FALLBACK_DELAY_MS = 1500

export function prefetchAfterFirstFrame(): void {
  const go = () => {
    const run = () => void Promise.all([loadSheets(), loadInteriorEditor(), loadCommandMenu()]).catch(() => undefined)
    if ('requestIdleCallback' in globalThis) globalThis.requestIdleCallback(run)
    else setTimeout(run, FALLBACK_DELAY_MS)
  }
  if (useSplash.getState().ready) return go()
  const stop = useSplash.subscribe((s) => {
    if (!s.ready) return
    stop()
    go()
  })
}
