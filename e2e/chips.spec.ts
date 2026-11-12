import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/** The part chips are DOM elements pinned to the scene; they come and go with picks, locks, hides, undo and display styles without React errors. */

const ROOT_ERRORS = /synchronously unmount a root|removeChild|not a child of this node|createRoot\(\) on a container/

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.railedEdges, null, { timeout: 60_000 })
})

const store = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([fn, args]) => (window as any).islandale.store.getState()[fn as string](...(args as unknown[])), [fn, args] as const)
const history = (page: Page, fn: 'undo' | 'redo') => page.evaluate((fn) => (window as any).islandale.store.temporal.getState()[fn](), fn)
const chips = (page: Page) => page.locator('[data-testid^="add-chip-"], [data-testid^="rail-chip-"], [data-testid="part-grip"]')

test('chips mount and unmount through picks, locks, hides, undo and display styles with no React root errors', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && ROOT_ERRORS.test(m.text())) errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))

  await store(page, 'loadScheme', 'C')
  const id = 'C-0'
  await page.evaluate((id) => (window as any).islandale.focus(id, 180, 30, 18), id)
  for (let round = 0; round < 2; round++) {
    // pick each part in turn: every switch swaps one set of chips for another
    for (const mass of [3, 4, 1, 0, 3]) {
      await store(page, 'pickPart', { objectId: id, mass })
      await expect(chips(page).first()).toBeAttached({ timeout: 15_000 })
    }
    // a lock takes every chip away at once, an unlock brings them back
    await store(page, 'setLocked', id, true)
    await expect(chips(page)).toHaveCount(0)
    await store(page, 'setLocked', id, false)
    await expect(chips(page).first()).toBeAttached({ timeout: 15_000 })
    // add a deck, undo and redo it: its chips come and go with it
    await store(page, 'addWing', id, { kind: 'deck', w: 8, d: 8, dx: 40, dz: 0 })
    await history(page, 'undo')
    await history(page, 'redo')
    await history(page, 'undo')
    await store(page, 'pickPart', { objectId: id, mass: 3 })
    await expect(chips(page).first()).toBeAttached({ timeout: 15_000 })
    // the layer and the display style
    await store(page, 'setLayer', 'buildings', { visible: false })
    await expect(chips(page)).toHaveCount(0)
    await store(page, 'setLayer', 'buildings', { visible: true })
    await store(page, 'pickPart', { objectId: id, mass: 3 })
    for (const style of ['white', 'diagram', 'realistic']) {
      await store(page, 'setDisplayStyle', style)
      await expect(chips(page).first()).toBeAttached({ timeout: 15_000 })
    }
    await store(page, 'select', [])
    await expect(chips(page)).toHaveCount(0)
  }
  // React reports a deferred unmount after the commit that asked for it
  await page.waitForTimeout(1_000)
  expect(errors).toEqual([])
})

test('the mouse wheel over a chip zooms the view, and the chip still takes its click (R9.10)', async ({ page }) => {
  test.setTimeout(120_000)
  await store(page, 'loadScheme', 'C')
  const id = 'C-0'
  await page.evaluate((id) => (window as any).islandale.focus(id, 180, 30, 18), id)
  await store(page, 'pickPart', { objectId: id, mass: 0 })
  const chip = page.locator('[data-testid^="add-chip-"]').first()
  await expect(chip).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(500)
  const box = (await chip.boundingBox())!
  const distance = () =>
    page.evaluate((id) => {
      const [x, y, z] = (window as any).islandale.camera() as number[]
      const b = (window as any).islandale.boundsOf(id)
      const c = b ? [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] : [0, 0, 0]
      return Math.hypot(x - c[0], y - c[1], z - c[2])
    }, id)
  const before = await distance()
  // the chip is what the pointer is over
  expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.chip-anchor'), { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -600)
  await expect.poll(distance, { timeout: 10_000 }).toBeLessThan(before - 0.5)

  // a click on the + chip still opens its menu
  await chip.click()
  await expect(page.getByRole('menu', { name: /^Add to/ })).toBeVisible()
})
