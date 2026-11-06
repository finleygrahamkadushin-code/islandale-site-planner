import { expect, test } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Rebuild walks as path pieces (after 5F): from the Build tab, Scheme C's
 * walks become path pieces in one undo step, the route check gives its real
 * verdicts (the prow only by its stair), and undo brings the walks back.
 */

const state = <T,>(page: import('@playwright/test').Page, f: string) =>
  page.evaluate((f) => new Function('s', `return ${f}`)((window as any).islandale.store.getState()), f) as Promise<T>

test('rebuild Scheme C walks, read the route check, undo', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.store, null, { timeout: 60_000 })
  await page.evaluate(() => {
    const w = (window as any).islandale
    w.store.getState().loadScheme('C')
    w.store.getState().select([])
    w.store.temporal.getState().clear()
  })
  await page.getByTestId('tab-build').click()
  const kinded = 's.plan.order.filter((id) => typeof s.plan.objects[id].params.kind === "string").length'
  expect(await state<number>(page, kinded)).toBe(0)
  await page.getByTestId('rebuild-walks').getByRole('button', { name: 'Rebuild walks as path pieces' }).click()
  await expect.poll(() => state<number>(page, kinded)).toBeGreaterThan(4)
  expect(await state<string>(page, 's.toast?.text')).toMatch(/^Rebuilt \d+ walks as \d+ path pieces/)
  expect(await page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)).toBe(1)
  await expect(page.getByTestId('rebuild-walks')).toHaveCount(0)
  await expect(page.getByTestId('route-rows')).toContainText('Gathering prow: only by its stair')
  await page.evaluate(() => (window as any).islandale.store.temporal.getState().undo())
  await expect.poll(() => state<number>(page, kinded)).toBe(0)
  await expect(page.getByTestId('rebuild-walks')).toBeVisible()
})
