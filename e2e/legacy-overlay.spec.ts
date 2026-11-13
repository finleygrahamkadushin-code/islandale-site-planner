import { expect, test } from '@playwright/test'

/**
 * R10.6: the old planner's overlay holds focus like a dialog. File → Old
 * planner exists only in a production build (it is the hosted home's), so
 * this spec runs against a built preview and is skipped otherwise:
 *
 *   npm run build && npx vite preview --port 5198 --strictPort
 *   ISLANDALE_BUILD_URL=http://localhost:5198 npx playwright test e2e/legacy-overlay.spec.ts
 */

const URL = process.env.ISLANDALE_BUILD_URL
test.skip(!URL, 'needs a production build: set ISLANDALE_BUILD_URL')
test.use({ baseURL: URL })

test('the old planner opens with focus on Back, keeps Tab inside, and Escape hands focus back to File (R10.6)', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => {
    localStorage.setItem('islandale-tour', 'done')
    localStorage.setItem('islandale-mode', 'advanced')
  })
  await page.goto('/')
  const file = page.getByTestId('menu-file')
  await expect(file).toBeVisible({ timeout: 60_000 })
  await file.click()
  await page.getByRole('menuitem', { name: /Old planner/ }).click()
  const overlay = page.locator('.legacy-planner')
  const back = page.getByRole('button', { name: 'Back to the new planner' })
  await expect(overlay).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Old planner' })).toBeVisible()
  await expect(back).toBeFocused()
  // Tab and Shift+Tab never leave the overlay for the planner behind it
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('.legacy-planner'))
  for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    expect(await inside(), `after ${key}`).toBe(true)
  }
  await back.focus()
  await page.keyboard.press('Escape')
  await expect(overlay).toHaveCount(0)
  await expect(file).toBeFocused()
})
