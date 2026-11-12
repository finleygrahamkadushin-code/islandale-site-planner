import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'
import { pickView } from './menus'
import { openSection } from './inspector'

/**
 * Phase 2 done-when check: rearrange Scheme C, lock it, hide names, reload,
 * and find it unchanged.
 */

const PATIO = 'C-7' // Firepit patio · flagstone in Scheme C
const FT = 0.3048

interface Snapshot {
  x: number
  n: number
  locked: boolean
  labelMode: string
  labels: number
  undoSteps: number
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate((id) => {
    const w = window as unknown as { islandale: { store: any } }
    const s = w.islandale.store.getState()
    const o = s.plan.objects[id]
    return {
      x: o.position.x,
      n: o.position.n,
      locked: o.locked,
      labelMode: s.labelMode,
      labels: document.querySelectorAll('.label').length,
      undoSteps: w.islandale.store.temporal.getState().pastStates.length,
    }
  }, PATIO)
}

async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 15_000 })
}

test('move, lock, hide names, reload: the plan comes back unchanged', async ({ page }) => {
  await page.goto('/')
  // Start from a clean browser: drop any earlier autosave, then reload.
  await clearSaves(page)
  await page.reload()
  await waitSaved(page)

  const start = await snapshot(page)
  expect(start.labels).toBe(17)
  expect(start.labelMode).toBe('all')

  // Select the patio by clicking just under its name label.
  const label = page.locator('.label', { hasText: 'Firepit patio' })
  await expect(label).toBeVisible({ timeout: 20_000 })
  const box = (await label.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height + 18)
  await expect
    .poll(() => page.evaluate(() => (window as any).islandale.store.getState().selection))
    .toEqual([PATIO])
  await expect(page.getByRole('region', { name: 'Inspector' })).toBeVisible()

  // Move it 3 ft east with the arrow keys: three undo steps.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  const moved = await snapshot(page)
  expect(moved.x).toBeCloseTo(start.x + 3 * FT, 6)
  expect(moved.undoSteps).toBe(3)

  // Lock it: the gizmo goes away and a nudge is refused with a toast.
  await openSection(page, 'visibility')
  await page.getByLabel('Locked').check()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('status').filter({ hasText: /locked/i })).toBeVisible()
  const locked = await snapshot(page)
  expect(locked.locked).toBe(true)
  expect(locked.x).toBeCloseTo(moved.x, 9)

  // Hide every name.
  await pickView(page, 'labels-none')
  await expect(page.locator('.label')).toHaveCount(0)

  // Reload and find it all still there.
  await waitSaved(page)
  await page.reload()
  await waitSaved(page)
  const after = await snapshot(page)
  expect(after.x).toBeCloseTo(moved.x, 9)
  expect(after.n).toBeCloseTo(moved.n, 9)
  expect(after.locked).toBe(true)
  expect(after.labelMode).toBe('none')
  expect(after.labels).toBe(0)
  expect(after.undoSteps).toBe(0)
})

test('a locked layer locks its objects and the layers panel shows when nothing is selected', async ({ page }) => {
  await page.goto('/')
  await waitSaved(page)
  await page.keyboard.press('Escape')
  const layers = page.getByRole('region', { name: 'Layers' })
  await expect(layers).toBeVisible()
  await layers.getByRole('button', { name: 'Lock Trees' }).click()
  const treeLocked = await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    const tree = s.plan.order.find((id: string) => s.plan.objects[id].type === 'tree')
    const before = s.plan.objects[tree].position.x
    s.nudgeObjects([tree], 1, 0)
    return s.plan.objects[tree].position.x === before && s.layers.trees.locked
  })
  expect(treeLocked).toBe(true)
})
