import { expect, test, type Page } from '@playwright/test'
import { openFresh } from './fresh'
import { pickFromMenu } from './menus'

/** Section sheets (6I): the Gathering prow (C-0) of Scheme C gets a long and a cross section with their level marks, cut where its plan's marks say. */

test.beforeEach(async ({ page }) => {
  await openFresh(page)
  await page.evaluate(() => (window as any).islandale.store.getState().loadScheme('C'))
  await page.evaluate(() => (window as any).islandale.store.getState().select(['C-0']))
})

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Drawing sheets' })

async function open(page: Page) {
  await pickFromMenu(page, 'file', 'open-sheets')
  // the sheets load on first use (4E); the dev server compiles them on demand
  await expect(dialog(page)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('combobox', { name: 'Building' })).toHaveValue('C-0')
  // the elevations are their own spec's; leaving them off keeps the scene's captures out of this one
  await dialog(page).getByRole('checkbox', { name: 'Elevations' }).uncheck()
}

test('the Gathering prow has a long and a cross section, each with floor, plate, roof and grade marks in NAVD88', async ({ page }) => {
  await open(page)
  for (const [id, title] of [
    ['A', 'Section A–A (long)'],
    ['B', 'Section B–B (cross)'],
  ] as const) {
    const sheet = dialog(page).getByRole('region', { name: `Gathering prow: ${title}` }).first()
    await expect(sheet).toBeVisible()
    const section = sheet.locator(`[data-section="${id}"]`)
    await expect(section.locator('[data-seen="cut"] rect, [data-seen="cut"] polygon').first()).toBeAttached()
    const levels = section.locator('[data-level]')
    const labels = await levels.evaluateAll((els) => els.map((e) => e.getAttribute('data-level') ?? ''))
    expect(labels.join(' | ')).toMatch(/Floor/)
    expect(labels.join(' | ')).toMatch(/plate/)
    expect(labels.join(' | ')).toMatch(/Grade at cut/)
    expect(labels.some((l) => /ridge|roof|apex|crown|eave/.test(l))).toBe(true)
    await expect(levels.first().locator('text')).toContainText('NAVD88')
    await expect(section.locator('[data-grade="finished"]')).toBeAttached()
  }
})

test('the plan marks both cuts; moving A–A with the keys redraws its section, and Reset cuts puts it back', async ({ page }) => {
  await open(page)
  const plan = dialog(page).getByRole('region', { name: /Gathering prow: Floor plan/ }).first()
  await expect(plan.locator('[data-cut="A"]')).toBeAttached()
  await expect(plan.locator('[data-cut="B"]')).toBeAttached()
  const handle = plan.getByRole('slider', { name: /Section A–A/ }).first()
  const before = Number(await handle.getAttribute('aria-valuenow'))
  const sectionA = dialog(page).getByRole('region', { name: 'Gathering prow: Section A–A (long)' }).first().locator('[data-section="A"]')
  const drawnBefore = await sectionA.innerHTML()
  await handle.focus()
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowUp')
  await expect(handle).not.toHaveAttribute('aria-valuenow', String(before))
  // the planner behind keeps its plan: the arrows moved the cut, not the cabin
  expect(Math.abs(Number(await handle.getAttribute('aria-valuenow')) - before)).toBe(36)
  await expect.poll(() => sectionA.innerHTML()).not.toBe(drawnBefore)
  await dialog(page).getByRole('button', { name: 'Reset cuts' }).click()
  await expect(handle).toHaveAttribute('aria-valuenow', String(before))
})
