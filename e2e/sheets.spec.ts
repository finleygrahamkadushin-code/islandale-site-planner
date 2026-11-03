import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/** Drawing sheets: Scheme C's gathering cabin (C-0) at true scale, as a modal over the planner, printable, with a CSV for Excel. */

const PX_PER_IN = 96

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.captureElevation, null, { timeout: 60_000 })
  await page.evaluate(() => (window as any).islandale.store.getState().loadScheme('C'))
  await page.evaluate(() => (window as any).islandale.store.getState().select(['C-0']))
})

const sheetsButton = (page: Page) => page.getByRole('button', { name: 'Sheets', exact: true })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Drawing sheets' })
const planObject = (page: Page) => page.evaluate(() => JSON.stringify((window as any).islandale.store.getState().plan.objects['C-0']))
const sceneStats = (page: Page) => page.evaluate(() => (window as any).islandale.sceneStats())

async function open(page: Page) {
  await sheetsButton(page).click()
  await expect(dialog(page)).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Building' })).toHaveValue('C-0')
}

/** Waits until every elevation tile has its picture (Print turns back on once they have). */
async function elevationsDrawn(page: Page) {
  await expect(dialog(page).getByRole('button', { name: 'Print', exact: true })).toBeEnabled({ timeout: 90_000 })
}

test('the plan of C-0 is drawn at 1/4" = 1\'-0", and the 1 in check bar is an inch', async ({ page }) => {
  await open(page)
  const svg = dialog(page).locator('.sheet-svg').first()
  const { widthIn, viewBoxW } = await svg.evaluate((el) => ({
    widthIn: parseFloat(el.getAttribute('width') ?? ''),
    viewBoxW: Number((el.getAttribute('viewBox') ?? '').split(' ')[2]),
  }))
  expect(viewBoxW).toBeGreaterThan(0)
  expect(widthIn).toBeCloseTo(viewBoxW * 0.25, 6)
  const rendered = await svg.evaluate((el) => el.getBoundingClientRect().width)
  expect(rendered).toBeCloseTo(widthIn * PX_PER_IN, 0)
  const bar = await dialog(page).locator('.sheet-inch-bar').first().evaluate((el) => el.getBoundingClientRect().width)
  expect(bar).toBeCloseTo(PX_PER_IN, 1)
})

test('the planner behind is inert: Delete and the arrow keys leave the plan alone while the sheets are open', async ({ page }) => {
  const before = await planObject(page)
  await open(page)
  expect(await page.evaluate(() => document.getElementById('root')?.inert)).toBe(true)
  await expect(dialog(page)).toHaveAttribute('aria-modal', 'true')
  for (const key of ['Delete', 'Backspace', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) await page.keyboard.press(key)
  expect(await planObject(page)).toBe(before)
})

test('opening focuses Back to the planner; Escape closes, even from a select, and gives the focus back to Sheets', async ({ page }) => {
  await open(page)
  await expect(dialog(page).getByRole('button', { name: 'Back to the planner' })).toBeFocused()
  await page.getByRole('combobox', { name: 'Paper size' }).focus()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(sheetsButton(page)).toBeFocused()
  expect(await page.evaluate(() => document.getElementById('root')?.inert)).toBe(false)
})

test('all four elevations finish as PNGs, and the 3D scene is left as it was', async ({ page }) => {
  test.setTimeout(150_000)
  const before = await sceneStats(page)
  await open(page)
  await elevationsDrawn(page)
  const hrefs = await dialog(page).locator('image').evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
  expect(hrefs.length).toBeGreaterThanOrEqual(4)
  for (const href of hrefs) expect(href.startsWith('data:image/png')).toBe(true)
  await expect(dialog(page).locator('.sheet-retry')).toHaveCount(0)
  expect(await sceneStats(page)).toEqual(before)
})

test('in print, only the sheets show: the planner and the sheets toolbar are hidden', async ({ page }) => {
  await open(page)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.app')).toBeHidden()
  await expect(page.locator('.sheets-bar')).toBeHidden()
  await expect(dialog(page).locator('.sheet-page').first()).toBeVisible()
})

test('Download measurements gives a UTF-8 CSV with a byte-order mark, the prow and its window W6', async ({ page }) => {
  await open(page)
  const [download] = await Promise.all([page.waitForEvent('download'), dialog(page).getByRole('button', { name: 'Download measurements' }).click()])
  expect(download.suggestedFilename()).toMatch(/\.csv$/)
  const text = await readFile(await download.path(), 'utf8')
  expect(text.charCodeAt(0)).toBe(0xfeff)
  expect(text).toContain('Gathering prow')
  expect(text).toContain('W6')
})
