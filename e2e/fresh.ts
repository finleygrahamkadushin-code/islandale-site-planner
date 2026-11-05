import type { Page } from '@playwright/test'

/**
 * What the older specs expect of a browser: Advanced mode and the tour already
 * seen, so no tour card or delete question gets in their way (4C). The
 * Beginner spec starts from a truly new browser with `clearSaves(page, { newcomer: true })`.
 */
export const SEASONED = { 'islandale-mode': 'advanced', 'islandale-tour': 'done' } as const

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
