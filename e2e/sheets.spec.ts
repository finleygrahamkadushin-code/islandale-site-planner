import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'
import { menuButton, pickFromMenu } from './menus'

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

const openSheets = (page: Page) => pickFromMenu(page, 'file', 'open-sheets')
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Drawing sheets' })
const planObject = (page: Page) => page.evaluate(() => JSON.stringify((window as any).islandale.store.getState().plan.objects['C-0']))
const sceneStats = (page: Page) => page.evaluate(() => (window as any).islandale.sceneStats())

async function open(page: Page) {
  await openSheets(page)
  // the sheets load on first use (4E); the dev server compiles them on demand, which takes a few seconds
  await expect(dialog(page)).toBeVisible({ timeout: 30_000 })
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

test('opening focuses Back to the planner; Escape closes, even from a select, and gives the focus back to File', async ({ page }) => {
  await open(page)
  await expect(dialog(page).getByRole('button', { name: 'Back to the planner' })).toBeFocused()
  await page.getByRole('combobox', { name: 'Paper size' }).focus()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(menuButton(page, 'file')).toBeFocused()
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

/** Scheme C4's gathering cabin (C4-0) and scheme D's curved cabin (D-0): a shell prow with a dipped tip, and a building of curves, rooms and thick walls. */
async function showScheme(page: Page, scheme: string, id: string, roofsOff = false) {
  await page.evaluate(
    ([s, i, off]) => {
      const st = (window as any).islandale.store.getState()
      st.loadScheme(s)
      st.setRoofsOff(off)
      st.select([i])
    },
    [scheme, id, roofsOff] as const,
  )
}

async function openOn(page: Page, id: string) {
  await openSheets(page)
  // the sheets load on first use (4E); the dev server compiles them on demand, which takes a few seconds
  await expect(dialog(page)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('combobox', { name: 'Building' })).toHaveValue(id, { timeout: 60_000 })
}

/** Every row of the measurement table titled `title`, continued blocks included, as cell text. */
const tableRows = (page: Page, title: string) =>
  dialog(page)
    .locator('table.sheet-table')
    .evaluateAll(
      (tables, t) =>
        tables
          .filter((el) => (el.querySelector('caption')?.firstChild?.textContent ?? '').replace(' (continued)', '').trim() === t)
          .flatMap((el) => [...el.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent ?? ''))),
      title,
    )

const columnOf = (page: Page, title: string, column: string) =>
  dialog(page)
    .locator('table.sheet-table')
    .evaluateAll((tables, [t, c]) => {
      const el = tables.find((e) => (e.querySelector('caption')?.firstChild?.textContent ?? '').trim() === t)
      return el ? [...el.querySelectorAll('thead th')].findIndex((th) => th.textContent === c) : -1
    }, [title, column])

const NONE_OR_ZERO = /^(—|-|)$|^0'-0"$/

async function elevationPngs(page: Page) {
  await elevationsDrawn(page)
  const hrefs = await dialog(page).locator('image').evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
  expect(hrefs.length).toBeGreaterThanOrEqual(4)
  for (const href of hrefs) expect(href.startsWith('data:image/png')).toBe(true)
  await expect(dialog(page).locator('.sheet-retry')).toHaveCount(0)
}

test("C4-0: the shell prow's dipped tip is in the Levels table, its walls are drawn, and its elevations finish", async ({ page }) => {
  test.setTimeout(240_000)
  await showScheme(page, 'C4', 'C4-0')
  await openOn(page, 'C4-0')
  const levels = (await tableRows(page, 'Levels')).map((r) => r[0])
  expect(levels.some((l) => l.includes('tip eave'))).toBe(true)
  expect(levels.some((l) => l.includes('tip eave, underside'))).toBe(true)
  expect(levels.some((l) => l.includes('tip column top'))).toBe(true)
  await expect(dialog(page).locator('g[aria-label$=" walls"]').first()).toBeAttached()
  await elevationPngs(page)
})

test('D-0: curves drawn true, every opening located, walls and rooms drawn, the measurements bounded, the elevations finish and the scene is left as it was with Roofs off', async ({ page }) => {
  test.setTimeout(420_000)
  // selected before the stats are read: the selection draws its own outline meshes
  await showScheme(page, 'D', 'D-0', true)
  await page.waitForTimeout(3_000)
  const before = await sceneStats(page)
  await openOn(page, 'D-0')
  await expect(dialog(page)).not.toContainText(/drawn as|approximate/i)

  const fromLeft = await columnOf(page, 'Openings', 'From left')
  const around = await columnOf(page, 'Openings', 'Round from P1')
  expect(fromLeft).toBeGreaterThanOrEqual(0)
  expect(around).toBeGreaterThanOrEqual(0)
  const openings = await tableRows(page, 'Openings')
  expect(openings.length).toBeGreaterThan(0)
  for (const row of openings) expect(NONE_OR_ZERO.test(row[fromLeft]) && NONE_OR_ZERO.test(row[around]), `opening ${row[0]} has a location`).toBe(false)

  const walls = dialog(page).locator('.sheet-svg g[aria-label$=" walls"]')
  expect(await walls.count()).toBeGreaterThan(0)
  // each wall band draws its outer and inner faces
  expect(await walls.first().locator('polygon, polyline').count()).toBeGreaterThanOrEqual(2)
  const rooms = await tableRows(page, 'Rooms')
  expect(rooms.length).toBeGreaterThan(0)
  await expect(dialog(page).locator('.sheet-svg g[aria-label="Rooms"] text').first()).toBeAttached()
  // the stilts and the decks' rim posts, under the floor
  expect(await dialog(page).locator('.sheet-svg g[aria-label="Supports"]').first().locator('line, circle, rect, polyline, polygon').count()).toBeGreaterThan(0)
  expect((await tableRows(page, 'Supports')).length).toBeGreaterThan(0)

  const measurementPages = await dialog(page).locator('section.sheet-page[aria-label*=": Measurements"]').count()
  expect(measurementPages).toBeGreaterThanOrEqual(1)
  expect(measurementPages).toBeLessThanOrEqual(6)

  await elevationPngs(page)
  await dialog(page).getByRole('button', { name: 'Back to the planner' }).click()
  await expect(dialog(page)).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).islandale.store.getState().roofsOff)).toBe(true)
  await expect.poll(() => sceneStats(page), { timeout: 30_000 }).toEqual(before)
})

test('the Supports checkbox draws the posts under C-0 on a foundation plan of their own, not on the floor plan', async ({ page }) => {
  await open(page)
  const supports = dialog(page).locator('.sheet-svg g[aria-label="Supports"]')
  const box = dialog(page).getByRole('checkbox', { name: 'Supports' })
  await expect(box).toBeChecked()
  expect(await supports.first().locator('rect, circle').count()).toBeGreaterThan(0)
  await expect(dialog(page).locator('section[aria-label*="Foundation plan"] g[aria-label="Supports"]').first()).toBeAttached()
  await expect(dialog(page).locator('section[aria-label*="Floor plan"] g[aria-label="Supports"]')).toHaveCount(0)
  await box.uncheck()
  await expect(dialog(page).locator('section[aria-label*="Foundation plan"]')).toHaveCount(0)
  await expect(supports).toHaveCount(0)
  await box.check()
  await expect(supports.first()).toBeAttached()
})
