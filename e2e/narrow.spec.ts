import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'
import { openMenu, pickView } from './menus'

/**
 * Phase 4E, steps 9 and 10: the light theme, and the planner at phone
 * (390 px) and tablet (768 px) widths. Under 900 px the side panel is a
 * sheet along the bottom, the top bar takes at most two rows with its File
 * and View menus (R9.1), and the tool strip runs along the bottom-left.
 * Nothing scrolls sideways, and nothing is removed.
 */

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
] as const
const TABS = ['site', 'build', 'interior', 'present'] as const

async function open(page: Page) {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    s.loadScheme('C')
    s.select([])
  })
}

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth)
const firstCabin = (page: Page) =>
  page.evaluate(() => {
    const p = (window as any).islandale.store.getState().plan
    return p.order.find((id: string) => p.objects[id].type === 'house') as string
  })

for (const size of SIZES) {
  test.describe(`${size.name} ${size.width} × ${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('no sideways scroll; every tab, the tool strip, the inspector and the File and View menus are reachable', async ({ page }) => {
      test.setTimeout(180_000)
      await open(page)
      expect(await noSidewaysScroll(page), 'no sideways scroll on load').toBe(true)

      for (const t of TABS) {
        await page.getByTestId(`tab-${t}`).click()
        await expect(page.getByTestId(`tab-${t}`)).toHaveAttribute('aria-selected', 'true')
        if (t === 'present') continue
        expect(await noSidewaysScroll(page), `no sideways scroll on ${t}`).toBe(true)
      }

      // the tool strip along the bottom-left, every button on screen
      await page.getByTestId('tab-build').click()
      const tools = page.locator('.toolstrip .tool-button')
      expect(await tools.count()).toBeGreaterThan(2)
      for (const b of await tools.all()) await expect(b).toBeInViewport()

      // the inspector in the sheet, once a cabin is selected
      const id = await firstCabin(page)
      await page.evaluate((i) => (window as any).islandale.store.getState().select([i]), id)
      const inspector = page.getByRole('region', { name: 'Inspector' })
      await inspector.scrollIntoViewIfNeeded()
      await expect(inspector).toBeInViewport()
      await expect(page.getByTestId('selection-stats')).toContainText('sq ft')
      expect(await noSidewaysScroll(page), 'no sideways scroll with the inspector open').toBe(true)

      // the sheet folds down to its bar and back
      await page.getByTestId('sheet-toggle').click()
      await expect(inspector).toBeHidden()
      await page.getByTestId('sheet-toggle').click()
      await expect(inspector).toBeVisible()

      // the tool strip and the bottom row sit above the sheet, not under it
      const sheetTop = (await page.locator('.side').boundingBox())!.y
      const stripBottom = (await page.locator('.toolstrip').boundingBox())!
      expect(stripBottom.y + stripBottom.height).toBeLessThanOrEqual(sheetTop + 1)
      const row = (await page.locator('.bottom-row').boundingBox())!
      expect(row.y + row.height).toBeLessThanOrEqual(stripBottom.y + 1)

      // the bar: two rows at most, the mode switch always in it; Export and the theme in the menus
      const rowHeight = (await page.getByTestId('menu-file').boundingBox())!.height
      expect((await page.locator('.topbar').boundingBox())!.height).toBeLessThan(rowHeight * 3)
      await expect(page.getByTestId('mode-advanced')).toBeInViewport()
      const exportRow = page.getByTestId('export-plan')
      await expect(exportRow).toBeHidden()
      await openMenu(page, 'file')
      await expect(exportRow).toBeInViewport()
      expect(await noSidewaysScroll(page), 'no sideways scroll with File open').toBe(true)
      await page.keyboard.press('Escape')
      await expect(exportRow).toBeHidden()
      await openMenu(page, 'view')
      await expect(page.getByTestId('theme-dark')).toBeVisible()
      expect(await noSidewaysScroll(page), 'no sideways scroll with View open').toBe(true)
      await page.keyboard.press('Escape')

      // the compass and scale bar sit below the top bar
      const bar = (await page.locator('.topbar').boundingBox())!
      const hud = await page.locator('.view-hud').boundingBox()
      if (hud) expect(hud.y).toBeGreaterThanOrEqual(bar.y + bar.height)
    })
  })
}

test.describe('light theme', () => {
  test.use({ viewport: { width: 768, height: 1024 }, colorScheme: 'dark' })

  test('Light marks the page, changes the panels and is remembered; System follows the browser', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page)
    const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? null)
    expect(await theme()).toBeNull()
    const dark = await bodyBg()

    await pickView(page, 'theme-light')
    expect(await theme()).toBe('light')
    const light = await bodyBg()
    expect(light).not.toBe(dark)

    await page.reload()
    await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
    expect(await theme()).toBe('light')
    expect(await bodyBg()).toBe(light)
    await openMenu(page, 'view')
    await expect(page.getByTestId('theme-light')).toHaveAttribute('aria-checked', 'true')

    // System: no mark, and the browser's setting decides
    await page.getByTestId('theme-system').click()
    expect(await theme()).toBeNull()
    expect(await bodyBg()).toBe(dark)
    await page.emulateMedia({ colorScheme: 'light' })
    expect(await bodyBg()).toBe(light)
    await page.getByTestId('theme-dark').click()
    expect(await theme()).toBe('dark')
    expect(await bodyBg()).toBe(dark)
  })
})

test.describe('screenshots', () => {
  for (const size of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      test.describe(`${size.name} ${scheme}`, () => {
        test.use({ viewport: { width: size.width, height: size.height }, colorScheme: scheme })
        test('saves a picture of the Build tab with a cabin selected and the File menu', async ({ page }) => {
          test.setTimeout(120_000)
          await open(page)
          await page.waitForFunction(() => (window as any).islandale?.screenOf, null, { timeout: 60_000 })
          await page.getByTestId('tab-build').click()
          const id = await firstCabin(page)
          await page.evaluate((i) => (window as any).islandale.store.getState().select([i]), id)
          await page.waitForTimeout(1500)
          await page.screenshot({ path: `test-results/narrow/${size.name}-${scheme}.png` })
          await openMenu(page, 'file')
          await page.screenshot({ path: `test-results/narrow/${size.name}-${scheme}-file.png` })
        })
      })
    }
  }
})
