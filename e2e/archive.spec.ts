import { expect, test } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Phase 5F done-when: every scheme opens from its card in the Designs
 * archive, in one undo step, framing the view, selecting the gathering
 * building and saying what opened; cards show the tag line, description,
 * badges and how the scheme does against the brief; the archive works from
 * the keyboard.
 */

const state = <T,>(page: import('@playwright/test').Page, f: string) =>
  page.evaluate((f) => new Function('s', `return ${f}`)((window as any).islandale.store.getState()), f) as Promise<T>

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.store, null, { timeout: 60_000 })
  await page.evaluate(() => {
    const w = (window as any).islandale
    w.store.getState().loadScheme('C')
    w.store.temporal.getState().clear()
  })
})

test('open H from its card: asks, loads in one undo step, selects the gathering building, says so; undo goes back', async ({ page }) => {
  test.setTimeout(180_000)
  await page.getByTestId('open-archive').click()
  const archive = page.getByTestId('archive')
  await expect(archive.getByTestId('archive-group-brief')).toBeVisible({ timeout: 20_000 })
  await expect(archive.getByTestId('scheme-card-C').getByTestId('open-now')).toBeVisible()
  const card = archive.getByTestId('scheme-card-H')
  await expect(card).toContainText('H · Sod & Contour')
  await expect(card).toContainText('meets the rubric')
  await expect(card.getByTestId('scheme-brief')).toContainText('1,505 of 1,600 sq ft')
  await expect(card).toContainText('1 cabin without a floor plan')
  await expect(card.locator('svg.scheme-thumb')).toBeVisible()
  await card.getByRole('button', { name: 'Open H · Sod & Contour' }).click()
  await page.getByRole('button', { name: 'Open', exact: true }).last().click() // the confirm dialog
  await expect.poll(() => state<string>(page, 's.plan.schemeId')).toBe('H')
  expect(await state<string>(page, 's.plan.objects[s.selection[0]].name')).toMatch(/Gathering/)
  // the message shows for 2.5 s, less than a software-drawn scheme takes to load, so read it from the store
  expect(await state<string>(page, 's.toast?.text')).toBe('Opened H · Sod & Contour')
  expect(await page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)).toBe(1)
  await page.evaluate(() => (window as any).islandale.store.temporal.getState().undo())
  await expect.poll(() => state<string>(page, 's.plan.schemeId')).toBe('C')
})

test('F shows rules off; I shows a cabin without a floor plan', async ({ page }) => {
  test.setTimeout(180_000)
  await page.getByTestId('open-archive').click()
  const f = page.getByTestId('scheme-card-F')
  await expect(f).toContainText('Rules off', { timeout: 20_000 })
  await expect(f.getByTestId('scheme-brief')).toContainText('rules off')
  await f.getByRole('button', { name: 'Open F · Sky Datum' }).click()
  await page.getByRole('button', { name: 'Open', exact: true }).last().click()
  await expect.poll(() => state<string>(page, 's.plan.schemeId')).toBe('F')
  expect(await state<string>(page, 's.toast?.text')).toMatch(/Rules off/)
  await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    s.loadScheme('I')
    const p = (window as any).islandale.store.getState().plan
    const cabin = p.order.map((id: string) => p.objects[id]).find((o: any) => o.type === 'house' && !(o.params.floors ?? []).some((f: any) => f?.rooms?.length))
    s.select([cabin.id])
  })
  await page.getByTestId('tab-interior').click()
  await expect(page.getByTestId('no-floor-plan')).toContainText('No floor plan yet')
})

test('the archive works from the keyboard and Escape returns focus', async ({ page }) => {
  test.setTimeout(120_000)
  const button = page.getByTestId('open-archive')
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('archive-group-current')).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('archive')).toHaveCount(0)
  await expect(button).toBeFocused()
})
