import { expect, type Page } from '@playwright/test'

/**
 * What the older specs expect of a browser: Advanced mode and the tour already
 * seen, so no tour card or delete question gets in their way (4C). The
 * Beginner spec starts from a truly new browser with `clearSaves(page, { newcomer: true })`.
 */
export const SEASONED = { 'islandale-mode': 'advanced', 'islandale-tour': 'done' } as const

/**
 * Open the planner with nothing saved, its plan loaded and its 3D view up.
 * The saves are cleared on the server's plan endpoint, a page of the same
 * origin where the app is not running, so nothing is deleted under a planner
 * that is still loading or saving, and no reload is needed (a reload can be
 * cancelled by the planner's "unsaved changes" prompt, `net::ERR_ABORTED`).
 */
export async function openFresh(page: Page, { newcomer = false }: { readonly newcomer?: boolean } = {}): Promise<void> {
  await page.goto('/__plan')
  await clearSaves(page, { newcomer })
  await page.goto('/')
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  // the 3D view is up once the scene has put its probes on window.islandale
  await page.waitForFunction(() => typeof (window as { islandale?: { renderInfo?: unknown } }).islandale?.renderInfo === 'function', null, { timeout: 60_000 })
}

/** Forget every saved copy: this browser's (IndexedDB and localStorage) and the test server's plan file. */
export async function clearSaves(page: Page, { newcomer = false }: { readonly newcomer?: boolean } = {}): Promise<void> {
  await page.evaluate(
    async ({ seed }) => {
      indexedDB.deleteDatabase('keyval-store')
      localStorage.clear()
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
      await fetch('/__plan', { method: 'DELETE' })
    },
    { seed: newcomer ? {} : SEASONED },
  )
}
