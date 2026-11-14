import { expect, test, type Page } from '@playwright/test'
import { openFresh } from './fresh'
import { openSection } from './inspector'
import { viewSettled } from './settle'

/**
 * Phase 5D done-when, second half: any wall, roof or rail can be repainted
 * from the Exterior panel, each paint one undo step, and a lock refuses it.
 * Paint mode (P) shows what the pointer is over and picks it.
 */

const PROW = 'C-0'

test.beforeEach(async ({ page }) => {
  await openFresh(page)
  await page.evaluate(() => (window as any).islandale.store.getState().loadScheme('C'))
  await page.evaluate((id) => (window as any).islandale.store.getState().select([id]), PROW)
  // the Exterior panel sits under the inspector's Look heading (4B)
  await openSection(page, 'look')
  await expect(page.getByTestId('ext-panel')).toBeVisible()
})

const ext = (page: Page) => page.evaluate((id) => structuredClone((window as any).islandale.store.getState().plan.objects[id].params.ext ?? null), PROW)
const pastSteps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)
const undo = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().undo())

/**
 * Each repaint rebuilds the cabin and compiles the new finish's shaders on the main thread: 4–7 s of
 * long tasks per step measured at a load average of 30 (R11.5), longer on a busier machine. The
 * store can't be read until that is done, so the change gets 30 s to show, as the preset test does.
 */
const REPAINT_MS = 30_000

test('paint one wall, the roof and the rails; each is one undo step', async ({ page }) => {
  test.setTimeout(180_000)
  const panel = page.getByTestId('ext-panel')
  // the cabin drawn as loaded, so the first step's time is its own
  await viewSettled(page)
  const steps0 = await pastSteps(page)

  // one wall of the main mass, cedar
  await panel.getByTestId('ext-part').selectOption('wall')
  await panel.getByTestId('ext-wall').selectOption('0')
  await panel.getByTestId('ext-scope-element').click()
  await panel.getByTestId('ext-kind').selectOption('cedar')
  await expect.poll(async () => (await ext(page))?.walls?.['0:0']?.kind, { timeout: REPAINT_MS }).toBe('cedar')
  expect(await pastSteps(page)).toBe(steps0 + 1)
  await expect(panel.getByTestId('ext-row')).toHaveCount(1)
  await undo(page)
  await expect.poll(() => ext(page), { timeout: REPAINT_MS }).toBeNull()
  await viewSettled(page)

  // the main roof, copper
  await panel.getByTestId('ext-part').selectOption('roof')
  await panel.getByTestId('ext-rmat').selectOption('copper')
  await expect.poll(async () => (await ext(page))?.masses?.['0']?.roof?.mat, { timeout: REPAINT_MS }).toBe('copper')
  expect(await pastSteps(page)).toBe(steps0 + 1)
  await undo(page)
  await expect.poll(() => ext(page), { timeout: REPAINT_MS }).toBeNull()
  await viewSettled(page)

  // every rail on the building, steel
  await panel.getByTestId('ext-part').selectOption('rail')
  await panel.getByTestId('ext-scope-house').click()
  await panel.getByTestId('ext-rail').selectOption('steel')
  await expect.poll(async () => (await ext(page))?.parts?.rail?.style, { timeout: REPAINT_MS }).toBe('steel')
  expect(await pastSteps(page)).toBe(steps0 + 1)
  await undo(page)
  await expect.poll(() => ext(page), { timeout: REPAINT_MS }).toBeNull()
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
  // the camera has moved and the cabin is drawn where the click goes
  await viewSettled(page)
  const box = (await page.locator('canvas').first().boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect.poll(() => page.evaluate(() => (window as any).islandale.store.getState().paintFocus?.objectId), { timeout: 20_000 }).toBe(PROW)
  await expect(page.getByTestId('ext-target')).not.toHaveText('')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('paint-hud')).toHaveCount(0)
})
