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
/** A field by its caption (an error joins the label's accessible name, so getByLabel would miss a field in error). */
const field = (page: Page, label: string) =>
  page
    .getByTestId('part-inspector')
    .locator('label.field')
    .filter({ has: page.locator('span.muted', { hasText: new RegExp(`^${label}$`) }) })
    .locator('input, select')
const wing = (page: Page, id: string, mi: number) =>
  page.evaluate(([id, mi]) => structuredClone((window as any).islandale.store.getState().plan.objects[id as string].params.wings[(mi as number) - 1]), [id, mi] as const)

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

test('focusing and leaving the Angle field without typing keeps a fractional angle and adds no undo step', async ({ page }) => {
  const id = 'C-0'
  await pick(page, id, 4)
  await store(page, 'updateWing', id, 4, { rot: 37.482 })
  await expect(field(page, 'Angle °')).toHaveValue('37.5')
  const rot = (await wing(page, id, 4)).rot
  expect(rot).toBeCloseTo(37.482, 6)
  const before = await steps(page)
  await field(page, 'Angle °').click()
  await page.getByTestId('part-inspector').locator('strong').first().click()
  expect((await wing(page, id, 4)).rot).toBe(rot)
  expect(await steps(page)).toBe(before)
})

test('a Level over 30 ft is refused with a message and no undo step, and the field keeps 30 ft', async ({ page }) => {
  const id = 'C-0'
  await pick(page, id, 4)
  await type(page, 'Level', '30')
  await expect(field(page, 'Level')).toHaveValue(`30'`)
  const before = await steps(page)
  await type(page, 'Level', '45')
  await expect(field(page, 'Level')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByTestId('part-inspector')).toContainText(`At most 30'`)
  expect((await wing(page, id, 4)).lvl).toBe(30)
  expect(await steps(page)).toBe(before)
})
