import { expect, test } from '@playwright/test'
import { clearSaves } from './fresh'
import { openMenu, pickFromMenu } from './menus'

/**
 * This copy of the planner holds Scheme C only (the full set of 12 is on
 * `main`), so there is no scheme to choose: the top bar has no Scheme list,
 * File has no Designs…, command search has no "Browse designs", and Reset
 * still gives Scheme C.
 */

const state = <T,>(page: import('@playwright/test').Page, f: string) =>
  page.evaluate((f) => new Function('s', `return ${f}`)((window as any).islandale.store.getState()), f) as Promise<T>

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.store, null, { timeout: 60_000 })
})

test('with Scheme C alone there is no Scheme list or Designs, and Reset gives Scheme C in one undo step', async ({ page }) => {
  test.setTimeout(180_000)
  expect(await state<string[]>(page, 's.schemes.map((x) => x.id)')).toEqual(['C'])
  await expect(page.getByTestId('scheme-select')).toHaveCount(0)

  const file = await openMenu(page, 'file')
  await expect(file.getByTestId('reset-plan')).toContainText('Reset to Scheme C…')
  await expect(page.getByTestId('open-archive')).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.getByTestId('open-commands').click()
  const search = page.getByRole('dialog', { name: 'Search actions and settings' })
  await expect(search).toBeVisible()
  await page.keyboard.type('designs')
  await expect(search).not.toContainText('Browse designs')
  await page.keyboard.press('Escape')
  await expect(search).toHaveCount(0)

  // clear the plan, then Reset brings Scheme C back
  await page.evaluate(() => {
    const w = (window as any).islandale
    w.store.getState().clearPlan()
    w.store.temporal.getState().clear()
  })
  expect(await state<number>(page, 's.plan.order.length')).toBe(0)
  await pickFromMenu(page, 'file', 'reset-plan')
  await page.getByTestId('confirm-yes').click()
  await expect.poll(() => state<string>(page, 's.plan.schemeId')).toBe('C')
  expect(await state<string[]>(page, 's.plan.order')).toEqual(Array.from({ length: 17 }, (_, i) => `C-${i}`))
  expect(await page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)).toBe(1)
})
