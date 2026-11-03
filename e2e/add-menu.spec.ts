import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/** Phase 5A: the + chip's menu stays on screen and clickable next to the side panel, and a menu its chip lost stays closed. */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.railedEdges, null, { timeout: 60_000 })
})

const store = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([fn, args]) => (window as any).islandale.store.getState()[fn as string](...(args as unknown[])), [fn, args] as const)
const steps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)
const chips = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="add-chip-"]')].map((e) => {
      const r = e.getBoundingClientRect()
      return { id: e.getAttribute('data-testid')!, x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }),
  )
/** What a real click at the centre of an element would land on. */
const topAt = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => {
    const r = el.getBoundingClientRect()
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-testid]')?.getAttribute('data-testid') ?? null
  })

test('a + chip just left of the side panel opens its menu to the left, and every item can be clicked', async ({ page }) => {
  test.setTimeout(120_000)
  await store(page, 'loadScheme', 'C')
  await store(page, 'pickPart', { objectId: 'C-2', mass: 0 })
  const side = await page.locator('aside.side').boundingBox()
  if (!side) throw new Error('no side panel')
  // slide the camera sideways until a chip sits within a menu's width of the panel
  let chip: { id: string; x: number; y: number } | undefined
  for (let dx = 0; dx <= 30 && !chip; dx += 0.5) {
    await page.evaluate((dx) => {
      const isl = (window as any).islandale
      isl.focus('C-2', 180, 16, 26)
      const p = isl.camera()
      isl.look([p[0] - dx, p[1], p[2]], [p[0] - dx, p[1] - 24, p[2] - 16])
    }, dx)
    await page.waitForTimeout(150)
    chip = (await chips(page)).find((c) => c.x > side.x - 100 && c.x < side.x - 20 && c.y > 150 && c.y < 650)
  }
  if (!chip) throw new Error('no + chip came near the side panel')
  await page.mouse.click(chip.x, chip.y)
  const menu = page.locator('.aa-pop')
  await expect(menu).toBeVisible()
  // the menu is placed each frame; under software rendering a frame can take seconds
  await expect.poll(async () => (await menu.boundingBox())!.x + (await menu.boundingBox())!.width, { timeout: 20_000 }).toBeLessThanOrEqual(side.x)
  for (const k of ['deck', 'porch', 'stair', 'ramp', 'door']) expect(await topAt(page, `add-${k}`), k).toBe(`add-${k}`)
  const before = await steps(page)
  await page.getByTestId('add-deck').click()
  await expect.poll(() => steps(page)).toBe(before + 1)
})

test('a menu whose chip undo took away stays closed on redo', async ({ page }) => {
  test.setTimeout(120_000)
  await store(page, 'loadScheme', 'C')
  await store(page, 'pickPart', { objectId: 'C-2', mass: 0 })
  await page.evaluate(() => (window as any).islandale.focus('C-2', 180, 16, 26))
  await page.getByTestId('add-chip-0-0').click()
  await page.getByTestId('add-deck').click()
  const chip = page.getByTestId('add-chip-4-1')
  await chip.click()
  const menu = page.locator('.aa-pop')
  await expect(menu).toHaveCount(1)
  await page.keyboard.press('Control+z')
  await expect(menu).toHaveCount(0)
  await page.keyboard.press('Control+Shift+z')
  await store(page, 'pickPart', { objectId: 'C-2', mass: 4 })
  await expect(chip).toBeVisible()
  await expect(menu).toHaveCount(0)
  // and the next click on the chip opens it, not closes it
  await chip.click()
  await expect(menu).toHaveCount(1)
})
