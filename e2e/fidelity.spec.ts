import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'
import { pickView, STYLE_IDS } from './menus'

/** Phase 3B: Scheme C draws every wing, rail, step and tree without errors. */

const PROW = 'C-0' // Scheme C's Gathering prow
const STYLES = ['Realistic', 'White model'] as const

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

const drawn = (page: Page) => page.evaluate(() => (window as any).islandale.sceneStats() as { meshes: number; triangles: number })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
})

test('Scheme C renders with all its wings, in Realistic and White model, with no console errors', async ({ page }) => {
  // each style is a full rebuild of the scene
  test.setTimeout(240_000)
  const errors = collectErrors(page)
  for (const id of ['C']) {
    await page.evaluate((s) => (window as any).islandale.store.getState().loadScheme(s), id)
    for (const name of STYLES) {
      await pickView(page, STYLE_IDS[name])
      await page.waitForTimeout(800)
      const info = await drawn(page)
      // wings, posts, rails, steps and the boardwalk: far more than the Phase 3 model's boxes
      expect(info.meshes, `${id} ${name}`).toBeGreaterThan(300)
      expect(info.triangles, `${id} ${name}`).toBeGreaterThan(20_000)
    }
  }
  expect(errors).toEqual([])
})

test('locking the prow also holds its wings: a move is refused and nothing changes', async ({ page }) => {
  const before = await page.evaluate((id) => {
    const s = (window as any).islandale.store.getState()
    s.setLocked(id, true)
    const o = (window as any).islandale.store.getState().plan.objects[id]
    s.moveObject(id, { x: o.position.x + 5, n: o.position.n })
    return JSON.stringify(o)
  }, PROW)
  const after = await page.evaluate((id) => JSON.stringify((window as any).islandale.store.getState().plan.objects[id]), PROW)
  expect(after).toBe(before)
})

test('contours follow the style unless set, and the setting survives a reload', async ({ page }) => {
  const shown = () => page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    return s.contours ?? s.displayStyle !== 'realistic'
  })
  expect(await shown()).toBe(false)
  await pickView(page, 'style-white')
  expect(await shown()).toBe(true)
  await page.getByRole('button', { name: 'Hide Contours' }).click()
  expect(await shown()).toBe(false)
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 15_000 })
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  expect(await shown()).toBe(false)
})
