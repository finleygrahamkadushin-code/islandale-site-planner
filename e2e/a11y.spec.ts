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
