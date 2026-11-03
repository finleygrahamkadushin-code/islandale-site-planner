import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Phase 5D: a cabin's footprint can be changed to a curve from the
 * inspector, with its one extra field (a kidney's bend); each change is one
 * undo step and a lock refuses it. The walls follow the curve.
 */

const CABIN = 'C-1'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.evaluate(() => (window as any).islandale.store.getState().loadScheme('C'))
})

const params = (page: Page, id: string) => page.evaluate((id) => structuredClone((window as any).islandale.store.getState().plan.objects[id].params), id)
const pastSteps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)
const select = (page: Page, id: string) => page.evaluate((id) => (window as any).islandale.store.getState().select([id]), id)

test('change a cabin to a kidney and its bend, one undo step each', async ({ page }) => {
  await select(page, CABIN)
  const steps0 = await pastSteps(page)
  await page.getByTestId('shape-select').selectOption('kidney')
  await expect.poll(async () => (await params(page, CABIN)).shape, { timeout: 20_000 }).toBe('kidney')
  expect(await pastSteps(page)).toBe(steps0 + 1)

  const bend = page.getByTestId('shape-fields').getByLabel(/Bend/)
  await bend.fill('0.6')
  await bend.press('Enter')
  await expect.poll(async () => (await params(page, CABIN)).bend, { timeout: 20_000 }).toBe(0.6)
  expect(await pastSteps(page)).toBe(steps0 + 2)

  // the walls follow the curve: far more vertices than the old box
  const box = await page.evaluate((id) => (window as any).islandale.boundsOf(id), CABIN)
  expect(box).toBeTruthy()

  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await params(page, CABIN)).bend).toBeUndefined()
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await params(page, CABIN)).shape).not.toBe('kidney')
})

test('a locked cabin refuses a new shape', async ({ page }) => {
  await page.evaluate((id) => (window as any).islandale.store.getState().setLocked(id, true), CABIN)
  await select(page, CABIN)
  const before = await params(page, CABIN)
  await expect(page.getByTestId('shape-select')).toBeDisabled()
  await page.evaluate((id) => (window as any).islandale.store.getState().setObjectParams(id, { shape: 'ellipse' }), CABIN)
  expect(await params(page, CABIN)).toEqual(before)
})
