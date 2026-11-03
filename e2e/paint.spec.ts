import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Phase 5D done-when, second half: any wall, roof or rail can be repainted
 * from the Exterior panel, each paint one undo step, and a lock refuses it.
 * Paint mode (P) shows what the pointer is over and picks it.
 */

const PROW = 'C-0'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.evaluate(() => (window as any).islandale.store.getState().loadScheme('C'))
  await page.evaluate((id) => (window as any).islandale.store.getState().select([id]), PROW)
  await expect(page.getByTestId('ext-panel')).toBeVisible()
})

const ext = (page: Page) => page.evaluate((id) => structuredClone((window as any).islandale.store.getState().plan.objects[id].params.ext ?? null), PROW)
const pastSteps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)
const undo = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().undo())

test('paint one wall, the roof and the rails; each is one undo step', async ({ page }) => {
  test.setTimeout(120_000)
  const panel = page.getByTestId('ext-panel')
  const steps0 = await pastSteps(page)

  // one wall of the main mass, cedar
  await panel.getByTestId('ext-part').selectOption('wall')
  await panel.getByTestId('ext-wall').selectOption('0')
  await panel.getByTestId('ext-scope-element').click()
  await panel.getByTestId('ext-kind').selectOption('cedar')
  await expect.poll(async () => (await ext(page))?.walls?.['0:0']?.kind).toBe('cedar')
  expect(await pastSteps(page)).toBe(steps0 + 1)
  await expect(panel.getByTestId('ext-row')).toHaveCount(1)
  await undo(page)
  await expect.poll(() => ext(page)).toBeNull()

  // the main roof, copper
  await panel.getByTestId('ext-part').selectOption('roof')
  await panel.getByTestId('ext-rmat').selectOption('copper')
  await expect.poll(async () => (await ext(page))?.masses?.['0']?.roof?.mat).toBe('copper')
  expect(await pastSteps(page)).toBe(steps0 + 1)
  await undo(page)
  await expect.poll(() => ext(page)).toBeNull()

  // every rail on the building, steel
  await panel.getByTestId('ext-part').selectOption('rail')
  await panel.getByTestId('ext-scope-house').click()
  await panel.getByTestId('ext-rail').selectOption('steel')
  await expect.poll(async () => (await ext(page))?.parts?.rail?.style).toBe('steel')
  expect(await pastSteps(page)).toBe(steps0 + 1)
  await undo(page)
  await expect.poll(() => ext(page)).toBeNull()
})

test('a preset paints the whole house and Reset exterior takes it all back in one step', async ({ page }) => {
  // each new finish compiles its shaders, slow under software rendering
  test.setTimeout(120_000)
  const panel = page.getByTestId('ext-panel')
  await panel.getByTestId('ext-scope-house').click()
  await panel.getByTestId('ext-preset-charcoal').click()
  await panel.getByTestId('ext-preset-metal').click()
  await expect.poll(async () => Object.keys((await ext(page))?.parts ?? {}).sort(), { timeout: 30_000 }).toEqual(['roof', 'wall'])
  const steps = await pastSteps(page)
  await panel.getByTestId('ext-reset').click()
  await expect.poll(() => ext(page)).toBeNull()
  expect(await pastSteps(page)).toBe(steps + 1)
})

test('a locked building refuses paint', async ({ page }) => {
  await page.evaluate((id) => (window as any).islandale.store.getState().setLocked(id, true), PROW)
  const panel = page.getByTestId('ext-panel')
  await expect(panel.getByTestId('ext-kind')).toBeDisabled()
  await page.evaluate((id) => (window as any).islandale.store.getState().editExterior(id, (p: Record<string, unknown>) => ({ ...p, ext: { parts: { wall: { kind: 'stone' } } } })), PROW)
  expect(await ext(page)).toBeNull()
  await expect(page.getByRole('status').filter({ hasText: /locked/i })).toBeVisible()
})

test('P turns Paint mode on with its chip, and Escape leaves it', async ({ page }) => {
  test.setTimeout(120_000)
  await page.locator('canvas').first().hover()
  await page.keyboard.press('p')
  await expect(page.getByTestId('paint-hud')).toBeVisible()
  await expect(page.getByTestId('paint-mode')).toHaveClass(/on/)
  // a click on the cabin picks the element under the pointer for the panel (names off, so no label is in the way)
  await page.evaluate((id) => {
    ;(window as any).islandale.store.getState().setLabelMode('none')
    ;(window as any).islandale.focus(id, 180, 18, 3)
  }, PROW)
  await page.waitForTimeout(1200)
  const box = (await page.locator('canvas').first().boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect.poll(() => page.evaluate(() => (window as any).islandale.store.getState().paintFocus?.objectId), { timeout: 20_000 }).toBe(PROW)
  await expect(page.getByTestId('ext-target')).not.toHaveText('')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('paint-hud')).toHaveCount(0)
})
