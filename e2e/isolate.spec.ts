import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Isolate and edit: double-click a cabin, or a member of a group, to work on
 * it alone (the rest fades and can't be picked), and Escape leaves. Groups
 * are plan edits (one undo step); isolating is not.
 */

const LANTERN = 'C-1'
const TWIN_POD = 'C-2'

const selection = (page: Page) => page.evaluate(() => [...(window as any).islandale.store.getState().selection] as string[])
const steps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length as number)

/** Aim the camera at an object so it fills the middle of the view, and give that point. */
async function aimAt(page: Page, id: string) {
  await page.evaluate((x) => (window as any).islandale.focus(x, 180, 16, 6), id)
  await page.waitForTimeout(1200)
  const box = (await page.locator('canvas').first().boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.focus, null, { timeout: 60_000 })
  await page.evaluate(() => {
    const s = (window as any).islandale.store
    s.getState().loadScheme('C')
    // names off, so no label sits over the click
    s.getState().setLabelMode('none')
    s.temporal.getState().clear()
  })
})

test('double-click a cabin to edit it alone; the rest cannot be picked; Escape leaves', async ({ page }) => {
  test.setTimeout(180_000)
  const lantern = await aimAt(page, LANTERN)
  await page.mouse.dblclick(lantern.x, lantern.y)
  await expect(page.getByTestId('isolate-chip')).toContainText('Family lantern')
  await expect.poll(() => selection(page)).toEqual([LANTERN])
  expect(await steps(page)).toBe(0)

  // the twin pod is faded: a click on it passes through and never selects it
  const pod = await aimAt(page, TWIN_POD)
  await page.mouse.click(pod.x, pod.y)
  await page.waitForTimeout(400)
  expect(await selection(page)).not.toContain(TWIN_POD)

  // Hide rest takes it out of the view; Fade brings it back
  await page.getByTestId('isolate-hide').click()
  await expect(page.getByTestId('isolate-hide')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('isolate-fade').click()

  await page.locator('canvas').first().hover()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('isolate-chip')).toHaveCount(0)
  // back out, the twin pod can be picked again
  await page.mouse.click(pod.x, pod.y)
  await expect.poll(() => selection(page), { timeout: 10_000 }).toEqual([TWIN_POD])
})

test('group two cabins: a click picks both; double-click opens the group, where a click picks one; Escape leaves', async ({ page }) => {
  test.setTimeout(180_000)
  await page.evaluate(([a, b]) => (window as any).islandale.store.getState().select([a, b]), [LANTERN, TWIN_POD])
  await page.locator('canvas').first().hover()
  await page.keyboard.press('ControlOrMeta+g')
  await expect.poll(() => steps(page)).toBe(1)
  await expect(page.getByTestId('ungroup-selection')).toBeVisible()

  await page.evaluate(() => (window as any).islandale.store.getState().select([]))
  const lantern = await aimAt(page, LANTERN)
  await page.mouse.click(lantern.x, lantern.y)
  await expect.poll(() => selection(page), { timeout: 10_000 }).toEqual([LANTERN, TWIN_POD])

  await page.mouse.dblclick(lantern.x, lantern.y)
  await expect(page.getByTestId('isolate-chip')).toContainText('Group of 2')
  await page.mouse.click(lantern.x, lantern.y)
  await expect.poll(() => selection(page), { timeout: 10_000 }).toEqual([LANTERN])

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('isolate-chip')).toHaveCount(0)
  // still one undo step: isolating and picking are not plan edits; undo takes the group apart
  expect(await steps(page)).toBe(1)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => page.evaluate((id) => (window as any).islandale.store.getState().plan.objects[id].group ?? null, LANTERN)).toBeNull()
})
