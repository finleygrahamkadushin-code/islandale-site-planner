import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/** Phase 3: every display style and saved view renders cleanly and changes no plan data. */

const STYLES = ['Realistic', 'White model', 'Sketch', 'Diagram'] as const
const VIEWS = ['Overview', 'From the water', 'Entry at the west notch', 'Golden hour', 'Plan (top)'] as const

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

const planOf = (page: Page) => page.evaluate(() => JSON.stringify((window as any).islandale.store.getState().plan))
const undoSteps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
})

test('each display style renders without errors and leaves the plan alone', async ({ page }) => {
  const errors = collectErrors(page)
  const before = await planOf(page)
  const styles = page.getByRole('group', { name: 'Display style' })
  for (const name of STYLES) {
    await styles.getByRole('button', { name, exact: true }).click()
    await expect(styles.getByRole('button', { name, exact: true })).toHaveClass(/on/)
    await page.waitForTimeout(600)
  }
  expect(await planOf(page)).toBe(before)
  expect(await undoSteps(page)).toBe(0)
  expect(errors).toEqual([])
})

test('each saved view moves the camera', async ({ page }) => {
  const errors = collectErrors(page)
  const strip = page.getByRole('navigation', { name: 'Saved views' })
  const poses = new Set<string>()
  for (const name of VIEWS) {
    await strip.getByRole('button', { name, exact: true }).click()
    await expect(strip.getByRole('button', { name, exact: true })).toHaveClass(/on/)
    await page.waitForTimeout(1300)
    poses.add(JSON.stringify(await page.evaluate(() => (window as any).islandale.camera())))
  }
  // five views, five different camera positions
  expect(poses.size).toBe(VIEWS.length)
  expect(errors).toEqual([])
  // the golden-hour view sets the late afternoon light
  const env = await page.evaluate(() => (window as any).islandale.store.getState().environment)
  expect(env.season).toBe('sep')
  expect(env.hour).toBeGreaterThan(16)
})

test('style and sun settings survive a reload', async ({ page }) => {
  await page.getByRole('group', { name: 'Display style' }).getByRole('button', { name: 'White model' }).click()
  // Sun and tide lives on the Site tab (4B)
  await page.getByTestId('tab-site').click()
  await page.getByRole('region', { name: 'Sun and tide' }).getByRole('button', { name: 'June' }).click()
  await page.getByLabel('Tide level').fill('9')
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 15_000 })
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  const s = await page.evaluate(() => {
    const st = (window as any).islandale.store.getState()
    return { style: st.displayStyle, season: st.environment.season, tide: st.environment.tideFt }
  })
  expect(s).toEqual({ style: 'white', season: 'jun', tide: 9 })
})
