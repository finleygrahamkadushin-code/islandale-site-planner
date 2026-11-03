import type { Page } from '@playwright/test'

/** Forget every saved copy: this browser's (IndexedDB and localStorage) and the test server's plan file. */
export async function clearSaves(page: Page): Promise<void> {
  await page.evaluate(async () => {
    indexedDB.deleteDatabase('keyval-store')
    localStorage.clear()
    await fetch('/__plan', { method: 'DELETE' })
  })
}
