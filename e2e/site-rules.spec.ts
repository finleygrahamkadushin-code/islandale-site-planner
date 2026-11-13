import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Phase 5E done-when: the setback sliders move the code check and the
 * clearance labels at once and survive a reload; selecting a cabin shows its
 * clearances and dimensions; a name in a code-check row selects it; the
 * Setbacks layer can be hidden; a rules-off scheme is checked against nothing;
 * none of it is an undo step.
 */

const state = <T,>(page: Page, f: string) => page.evaluate((f) => new Function('s', `return ${f}`)((window as any).islandale.store.getState()), f) as Promise<T>
const steps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length as number)
const setRange = (page: Page, label: string, v: number) =>
  page.getByLabel(label, { exact: true }).evaluate((el, v) => {
    const input = el as HTMLInputElement
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(v))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, v)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.store, null, { timeout: 60_000 })
  await page.evaluate(() => {
    const w = (window as any).islandale
    w.store.getState().loadScheme('C')
    w.store.getState().select([])
    w.store.temporal.getState().clear()
  })
  await page.getByTestId('tab-site').click()
})

test('setback sliders move the code check and clearances, are saved, and are never an undo step', async ({ page }) => {
  test.setTimeout(180_000)
  const shore = page.getByTestId('code-check').locator('[data-row="shore"]')
  // measured from the approximate high-water line (item 11), the Gathering prow is inside the default 35 ft buffer; a 20 ft one clears it
  await expect(shore).toHaveAttribute('data-verdict', 'fail')
  await expect(shore).toContainText('inside the 35 ft buffer: Gathering prow')
  await setRange(page, 'Shoreline setback', 20)
  await expect(shore).toHaveAttribute('data-verdict', 'pass')
  await setRange(page, 'Shoreline setback', 120)
  await expect(shore).toHaveAttribute('data-verdict', 'fail')
  await expect(shore).toContainText('inside the 120 ft buffer')
  expect(await steps(page)).toBe(0)

  // a name in a failing row selects that cabin; its clearance rows warn
  await shore.getByRole('button', { name: /Gathering prow/ }).click()
  expect(await state<string[]>(page, 's.selection')).toEqual(['C-0'])
  await expect(page.getByTestId('clearance-stats')).toContainText(`69'-9" to shore`)
  await expect(page.getByTestId('clearance-row').first()).toHaveClass(/warn/)

  // saved with the plan
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.reload()
  await page.waitForFunction(() => (window as any).islandale?.store, null, { timeout: 60_000 })
  expect(await state<number>(page, 's.setbacks.shoreFt')).toBe(120)
})

test('a selected cabin shows its clearances and the Setbacks layer hides', async ({ page }) => {
  test.setTimeout(120_000)
  await page.evaluate(() => (window as any).islandale.store.getState().select(['C-3']))
  const rows = page.getByTestId('clearance-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('to shore')
  await expect(rows.nth(1)).toContainText('to lot line')
  await expect(rows.nth(2)).toContainText(/to (?!Lane|Elders’ walk)/)
  await page.evaluate(() => (window as any).islandale.store.getState().select([]))
  await page.getByRole('button', { name: 'Hide Setbacks' }).first().click()
  expect(await state<boolean>(page, 's.setbacks.shown')).toBe(false)
  expect(await steps(page)).toBe(0)
})

test('the program budget sits on the Build tab, and a rules-off scheme is checked against nothing', async ({ page }) => {
  test.setTimeout(120_000)
  await page.getByTestId('tab-build').click()
  await expect(page.getByTestId('program-budget')).toContainText('/ 1,600 sq ft')
  await page.evaluate(() => (window as any).islandale.store.getState().loadScheme('D'))
  await page.getByTestId('tab-site').click()
  const check = page.getByTestId('code-check')
  await expect(check).toContainText('rules off')
  await expect(check.locator('[data-verdict="fail"]')).toHaveCount(0)
})

test('the shoreline buffer says where it is measured from, and the view names the approximate high-water line (item 11)', async ({ page }) => {
  test.setTimeout(120_000)
  await expect(page.getByTestId('shore-line-note')).toHaveText(
    'The shoreline buffer is measured from the 8 ft contour of the terrain model, an estimate of mean higher high water; the legal ordinary high water mark can only come from a survey and may be further landward.',
  )
  await expect(page.getByTestId('high-water-label')).toHaveText('approximate high-water line (8 ft NAVD88, from the terrain; not surveyed)')
  await expect(page.getByTestId('setbacks')).toContainText('Top of bank, in from the east high-water line')
})
