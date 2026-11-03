import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Phase 5D done-when, first half: Schemes D–I load and draw every curved
 * cabin, sculpted roof, finish, earthwork and site object without errors,
 * and each saved view is captured for the side-by-side check against the
 * old planner (test-results/old-designs/<scheme>-<view>.png).
 */

const SCHEMES = ['D', 'E', 'F', 'G', 'H', 'I'] as const
const VIEWS = ['Overview', 'From the water', 'Entry at the west notch', 'Golden hour'] as const

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && !/plan home/.test(m.text())) errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
})

for (const id of SCHEMES) {
  test(`Scheme ${id} draws its curved cabins, roofs and site objects, and every saved view is captured`, async ({ page }) => {
    // software rendering in CI draws these schemes at a few frames a second
    test.setTimeout(300_000)
    const errors = collectErrors(page)
    await page.evaluate((s) => {
      const st = (window as any).islandale.store.getState()
      st.loadScheme(s)
      st.setLabelMode('none')
    }, id)
    await page.waitForTimeout(1500)
    const stats = await page.evaluate(() => (window as any).islandale.sceneStats() as { meshes: number; triangles: number })
    expect(stats.meshes).toBeGreaterThan(200)
    expect(stats.triangles).toBeGreaterThan(20_000)
    const strip = page.getByRole('navigation', { name: 'Saved views' })
    for (const view of VIEWS) {
      await strip.getByRole('button', { name: view, exact: true }).click()
      await page.waitForTimeout(1400)
      await page.screenshot({ path: `test-results/old-designs/${id}-${view.replace(/\W+/g, '-').toLowerCase()}.png` })
    }
    expect(errors).toEqual([])
  })
}
