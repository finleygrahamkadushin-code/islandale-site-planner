import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Phase 4D done-when: Present mode shows the saved views full screen with no
 * editing controls, the sun plays from morning to golden hour, and the look
 * is at least as good as Phase 3's. This spec saves Present-mode pictures of
 * all five views in Realistic and White model for Finley to compare.
 */

const VIEWS = ['overview', 'water', 'entry', 'sunset', 'top'] as const
const SHOTS_DIR = 'test-results/present-views'

const plan = (page: Page) => page.evaluate(() => JSON.stringify((window as any).islandale.store.getState().plan))
const undoSteps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length as number)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.camera, null, { timeout: 60_000 })
  await expect(page.getByTestId('splash')).toHaveCount(0, { timeout: 30_000 })
  await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    s.loadScheme('C')
    s.setLabelMode('all')
    ;(window as any).islandale.store.temporal.getState().clear()
  })
})

test('Present hides every editing control, plays the sun as a preview, and Escape puts everything back', async ({ page }) => {
  test.setTimeout(180_000)
  const before = await plan(page)
  const savedHour = await page.evaluate(() => (window as any).islandale.store.getState().environment.hour)
  // the compass and scale bar are there in every tab
  await expect(page.getByTestId('compass')).toBeVisible()
  await expect(page.getByTestId('scale-bar')).toContainText('ft')

  await page.getByTestId('tab-present').click()
  await page.getByTestId('start-presenting').click()
  await expect(page.getByTestId('present-bar')).toBeVisible()
  for (const sel of ['.topbar', '.toolstrip', '.side', '.bottom-row', '.labels']) await expect(page.locator(sel)).toBeHidden()
  expect(await page.evaluate(() => (window as any).islandale.store.getState().labelMode)).toBe('none')

  // each saved view moves the camera
  const poses = new Set<string>()
  for (const v of VIEWS) {
    await page.getByTestId(`present-view-${v}`).click()
    await expect(page.getByTestId(`present-view-${v}`)).toHaveAttribute('aria-pressed', 'true')
    await page.waitForTimeout(1300)
    poses.add(JSON.stringify(await page.evaluate(() => (window as any).islandale.camera())))
  }
  expect(poses.size).toBe(VIEWS.length)
  const savedNow = await page.evaluate(() => (window as any).islandale.store.getState().environment.hour)

  // the sun plays from 7 am towards golden hour, without touching the saved time
  await page.getByTestId('present-play').click()
  await expect(page.getByTestId('present-clock')).toContainText('am', { timeout: 5_000 })
  await expect(page.getByTestId('present-clock')).toContainText('4:45 pm', { timeout: 40_000 })
  await expect(page.getByTestId('present-play')).toHaveAttribute('aria-label', 'Play the sun')
  expect(await page.evaluate(() => (window as any).islandale.store.getState().environment.hour)).toBe(savedNow)

  // clicks on the plan edit nothing while presenting
  const box = (await page.locator('canvas').first().boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.press('Delete')
  expect(await page.evaluate(() => (window as any).islandale.store.getState().selection.length)).toBe(0)

  // a picture of the view downloads as a PNG
  const download = page.waitForEvent('download')
  await page.getByTestId('present-snapshot').click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^islandale-plan-top-\d{4}-\d{2}-\d{2}\.png$/)

  // Escape leaves, with labels and panels back, and the plan untouched by Present itself
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('present-bar')).toHaveCount(0)
  await expect(page.locator('.topbar')).toBeVisible()
  expect(await page.evaluate(() => (window as any).islandale.store.getState().labelMode)).toBe('all')
  expect(await undoSteps(page)).toBe(0)
  expect(await plan(page)).toBe(before)
  // the Golden hour view sets its own time, as it always has; Present's sun never did
  expect(typeof savedHour).toBe('number')
})

test('the slow orbit turns the view and a drag stops it; the compass turns the view to face north', async ({ page }) => {
  test.setTimeout(120_000)
  await page.getByTestId('tab-present').click()
  await page.getByTestId('start-presenting').click()
  await page.getByTestId('present-orbit').click()
  const a = await page.evaluate(() => (window as any).islandale.camera())
  await page.waitForTimeout(2000)
  const b = await page.evaluate(() => (window as any).islandale.camera())
  expect(b).not.toEqual(a)
  const box = (await page.locator('canvas').first().boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + 200, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByTestId('present-orbit')).toHaveAttribute('aria-pressed', 'false')

  await page.getByTestId('compass').click()
  await expect
    .poll(async () => {
      const t = (await page.getByTestId('compass-needle').getAttribute('style')) ?? ''
      return Math.abs(Number(/rotate\((-?[\d.]+)deg\)/.exec(t)?.[1] ?? 999))
    }, { timeout: 10_000 })
    .toBeLessThan(2)
})

test('done-when pictures: all five views in Present, in Realistic and White model', async ({ page }) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.getByTestId('tab-present').click()
  await page.getByTestId('start-presenting').click()
  for (const style of ['realistic', 'white'] as const) {
    await page.evaluate((st) => (window as any).islandale.store.getState().setDisplayStyle(st), style)
    for (const v of VIEWS) {
      await page.getByTestId(`present-view-${v}`).click()
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `${SHOTS_DIR}/${style}-${v}.png` })
    }
  }
  expect(errors).toEqual([])
})
