import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * The plan's keyboard shortcuts stay out of the way of the control that has
 * focus: arrow keys on the task tabs and on a slider belong to them, and no
 * key reaches the plan through an open dialog.
 */

const FT = 0.3048
const CABIN = 'C-0'

type Snapshot = { x: number; n: number; rotation: number; exists: boolean; undoSteps: number; selection: string[]; hour: number }

const snapshot = (page: Page) =>
  page.evaluate((id) => {
    const w = (window as any).islandale
    const s = w.store.getState()
    const o = s.plan.objects[id]
    return {
      x: o?.position.x ?? NaN,
      n: o?.position.n ?? NaN,
      rotation: o?.rotation ?? NaN,
      exists: !!o,
      undoSteps: w.store.temporal.getState().pastStates.length,
      selection: s.selection,
      hour: s.environment.hour,
    }
  }, CABIN) as Promise<Snapshot>

test.beforeEach(async ({ page }) => {
  // the first load builds the whole 3D scene, which is slow in headless Chromium on a busy machine
  test.setTimeout(240_000)
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.store, null, { timeout: 60_000 })
  await page.evaluate((id) => {
    const w = (window as any).islandale
    w.store.getState().loadScheme('C')
    w.store.getState().select([id])
    w.store.temporal.getState().clear()
  }, CABIN)
})

test('arrow keys on the task tabs change the tab and leave the selected cabin where it is', async ({ page }) => {
  const start = await snapshot(page)
  await page.getByTestId('tab-build').click()
  await page.getByTestId('tab-build').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('tab-interior')).toHaveAttribute('aria-selected', 'true')
  const after = await snapshot(page)
  expect(after.x).toBe(start.x)
  expect(after.n).toBe(start.n)
  expect(after.undoSteps).toBe(0)
})

test('arrow keys on the Time of day slider move the slider, not the selected cabin', async ({ page }) => {
  await page.getByTestId('tab-site').click()
  const start = await snapshot(page)
  expect(start.selection).toEqual([CABIN])
  const slider = page.getByLabel('Time of day')
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await snapshot(page)).hour).toBeCloseTo(start.hour + 0.25, 6)
  const after = await snapshot(page)
  expect(after.x).toBe(start.x)
  expect(after.undoSteps).toBe(0)
})

test('no key reaches the plan through the open Designs dialog; Escape closes it and keeps the selection', async ({ page }) => {
  // with nothing in the way, an arrow key nudges the cabin 1 ft: one undo step
  const start = await snapshot(page)
  await page.keyboard.press('ArrowRight')
  const nudged = await snapshot(page)
  expect(nudged.x).toBeCloseTo(start.x + FT, 6)
  expect(nudged.undoSteps).toBe(1)

  await page.getByTestId('open-archive').click()
  const archive = page.getByTestId('archive')
  await expect(archive.getByTestId('archive-group-brief')).toBeVisible({ timeout: 20_000 })
  await archive.getByRole('button').first().focus()

  for (const key of ['Delete', 'Backspace', 'q', 'ArrowUp', 'ControlOrMeta+z']) await page.keyboard.press(key)
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
  const behind = await snapshot(page)
  expect(behind.exists, 'the cabin behind the dialog is not deleted').toBe(true)
  expect(behind.rotation).toBe(nudged.rotation)
  expect(behind.x).toBe(nudged.x)
  expect(behind.n).toBe(nudged.n)
  expect(behind.undoSteps, 'undo did not run behind the dialog').toBe(1)

  await page.keyboard.press('Escape')
  await expect(archive).toHaveCount(0)
  expect((await snapshot(page)).selection).toEqual([CABIN])
})
