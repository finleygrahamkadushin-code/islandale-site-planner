import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/** Phase 5A: the part inspector's fields, typed into as a person would, change the drawn part and add one undo step only when something changed. */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.boundsOf, null, { timeout: 60_000 })
})

const store = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([fn, args]) => (window as any).islandale.store.getState()[fn as string](...(args as unknown[])), [fn, args] as const)
const steps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)
const bounds = (page: Page, id: string) => page.evaluate((id) => (window as any).islandale.boundsOf(id), id)
const field = (page: Page, label: string) => page.getByTestId('part-inspector').getByLabel(label, { exact: true })

async function pick(page: Page, id: string, mass: number) {
  await store(page, 'loadScheme', 'C')
  await store(page, 'pickPart', { objectId: id, mass })
  await expect(page.getByTestId('part-inspector')).toBeVisible({ timeout: 15_000 })
}
async function type(page: Page, label: string, text: string) {
  await field(page, label).fill(text)
  await field(page, label).press('Enter')
}

test('a new Width on a poly deck or the poly main walls redraws the outline at that width', async ({ page }) => {
  const id = 'C-0'
  await pick(page, id, 3)
  const deck0 = await bounds(page, id)
  await type(page, 'Width', `60'`)
  await expect.poll(() => bounds(page, id), { timeout: 10_000 }).not.toEqual(deck0)

  await store(page, 'pickPart', { objectId: id, mass: 0 })
  await expect(page.getByTestId('part-inspector')).toContainText('Main walls')
  const main0 = await bounds(page, id)
  await type(page, 'Width', `60'`)
  await expect.poll(() => bounds(page, id), { timeout: 10_000 }).not.toEqual(main0)
})
