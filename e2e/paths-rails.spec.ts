import { expect, test } from '@playwright/test'
import { clearSaves } from './fresh'

/** Paths follow the hill, and every wing the old planner rails is railed here too. */

// wings (mass indexes) the old planner draws rails on, by building (object ids are <scheme>-<n>),
// read from legacy/islandale-planner.html; the same for C and C2–C4
const LEGACY_RAILED = (id: string) => ({ [`${id}-0`]: [2, 3], [`${id}-1`]: [1, 2], [`${id}-2`]: [1, 2, 3], [`${id}-3`]: [1, 2, 3] })
const PATH_TO_BEACH = (id: string) => `${id}-9`
const PAD_THICKNESS_M = 0.2 * 0.3048

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
})

test('C and C2 to C4 rail the same wings as the old planner, and the path to the beach bends with the slope', async ({ page }) => {
  test.setTimeout(120_000)
  // the scene registers its helpers once the canvas is up
  await page.waitForFunction(() => (window as any).islandale?.railedMasses, null, { timeout: 60_000 })
  for (const id of ['C', 'C2', 'C3', 'C4']) {
    await page.evaluate((s) => (window as any).islandale.store.getState().loadScheme(s), id)
    // the first frame of the full model can take a while in headless Chromium
    await expect.poll(() => page.evaluate(() => (window as any).islandale.railedMasses()), { message: id, timeout: 30_000 }).toEqual(LEGACY_RAILED(id))
    const b = await page.evaluate((p) => (window as any).islandale.boundsOf(p), PATH_TO_BEACH(id))
    // a flat slab would span only its thickness; the draped path falls more than a metre down the bank
    expect(b.max[1] - b.min[1], id).toBeGreaterThan(PAD_THICKNESS_M + 1)
  }
})
