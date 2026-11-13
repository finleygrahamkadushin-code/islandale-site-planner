import { expect, test } from '@playwright/test'
import { clearSaves } from './fresh'
import { menuButton, pickFromMenu } from './menus'
import { openSection } from './inspector'

/**
 * R10 accessibility: where focus goes when a dialog closes, and the task
 * tabs' tab panel. (Keyboard selection and placing are in keys.spec.ts and
 * tools.spec.ts; Add to selection in layout.spec.ts.)
 */

const CABIN = 'C-0'

test.beforeEach(async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.store, null, { timeout: 60_000 })
  await page.evaluate((id) => {
    const w = (window as any).islandale
    w.store.getState().loadScheme('C')
    w.store.getState().select([id])
    w.store.temporal.getState().clear()
  }, CABIN)
})

test('after the confirm dialog closes, focus goes back to the control that opened it (R10.7)', async ({ page }) => {
  // File → Reset…: Cancel, then Escape, each hand focus back to File
  for (const close of ['cancel', 'escape'] as const) {
    await pickFromMenu(page, 'file', 'reset-plan')
    await expect(page.getByTestId('confirm-dialog')).toBeVisible()
    if (close === 'cancel') await page.getByTestId('confirm-cancel').click()
    else await page.keyboard.press('Escape')
    await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
    await expect(menuButton(page, 'file')).toBeFocused()
  }
  // Beginner asks before a delete: Cancel goes back to the inspector's Delete button
  await page.evaluate(() => (window as any).islandale.store.getState().select(['C-0']))
  await page.getByTestId('mode-beginner').click()
  await openSection(page, 'visibility')
  await page.getByTestId('delete-object').click()
  await expect(page.getByTestId('confirm-dialog')).toBeVisible()
  await page.getByTestId('confirm-cancel').click()
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
  await expect(page.getByTestId('delete-object')).toBeFocused()
})

test('the task tabs control a tab panel labelled by the current tab (R10.4)', async ({ page }) => {
  for (const [id, name] of [['build', 'Build'], ['site', 'Site'], ['interior', 'Interior']] as const) {
    const tab = page.getByTestId(`tab-${id}`)
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    const panelId = await tab.getAttribute('aria-controls')
    expect(panelId, `tab ${id} names its panel`).toBeTruthy()
    const panel = page.locator(`[id="${panelId}"]`)
    await expect(panel).toHaveAttribute('role', 'tabpanel')
    await expect(panel).toHaveAttribute('aria-labelledby', `task-tab-${id}`)
    await expect(page.getByRole('tabpanel', { name })).toHaveCount(1)
  }
})

test('keyboard only: select by name, nudge, a locked refusal, delete, then place and stop (R10.1)', async ({ page }) => {
  const FT = 0.3048
  const store = <T,>(f: string) => page.evaluate((f) => new Function('s', `return ${f}`)((window as any).islandale.store.getState()), f) as Promise<T>
  const said = page.getByTestId('announcer')
  const view = page.locator('#plan-view')
  await page.evaluate(() => (window as any).islandale.store.getState().select([]))
  const name = await store<string>(`s.plan.objects['${CABIN}'].name`)

  // command search lists objects only once something is typed
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByTestId('command-input')).toBeFocused()
  await expect(page.locator('[data-testid^="command-select-"]')).toHaveCount(0)
  await page.keyboard.type(`Select ${name}`)
  await expect(page.getByTestId(`command-select-${CABIN}`)).toHaveAttribute('data-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('command-input')).toHaveCount(0)
  expect(await store<string[]>('s.selection')).toEqual([CABIN])
  // focus lands on the 3D view, visibly, and the choice is said
  await expect(view).toBeFocused()
  expect(await view.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
  await expect(said).toContainText(`Selected ${name}`)

  // the arrows follow the compass: right is east, 1 ft
  const x0 = await store<number>(`s.plan.objects['${CABIN}'].position.x`)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => store<number>(`s.plan.objects['${CABIN}'].position.x`)).toBeCloseTo(x0 + FT, 6)
  await expect(said).toContainText(`${name} at East`)

  // a locked object says why it did not move, as for a pointer user
  await page.evaluate((id) => (window as any).islandale.store.getState().setLocked(id, true), CABIN)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.toast-text')).toContainText('locked')
  expect(await store<number>(`s.plan.objects['${CABIN}'].position.x`)).toBeCloseTo(x0 + FT, 6)
  await page.evaluate((id) => (window as any).islandale.store.getState().setLocked(id, false), CABIN)

  // Delete (Advanced deletes at once) is said too
  await page.keyboard.press('Delete')
  await expect.poll(() => store<boolean>(`!!s.plan.objects['${CABIN}']`)).toBe(false)
  await expect(said).toContainText(`Deleted the ${name}`)

  // place: the ghost starts in view, the arrows move it north, Enter puts it down
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('place guest cabin')
  await page.keyboard.press('Enter')
  await expect(view).toBeFocused()
  await expect(said).toContainText('Placing Guest cabin at East')
  const n0 = await store<number>('s.placing.at.n')
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => store<number>('s.placing.at.n')).toBeCloseTo(n0 + FT, 6)
  await expect(said).toContainText('Ghost at East')
  const count = await store<number>('s.plan.order.length')
  await page.keyboard.press('Enter')
  await expect.poll(() => store<number>('s.plan.order.length')).toBe(count + 1)
  await expect(said).toContainText('Placed Guest cabin')
  expect(await store<boolean>('s.placing === null')).toBe(true)

  // and Escape stops placing, said
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('place guest cabin')
  await page.keyboard.press('Enter')
  await expect(view).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(said).toContainText('Placing stopped')
  expect(await store<boolean>('s.placing === null')).toBe(true)
})
