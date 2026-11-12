import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Phase 4C done-when: someone new, in Beginner mode, can place a cabin, move
 * it, lock it and save, in about a minute without help. The tour runs first
 * on a new browser, then the walk is done with the real controls.
 */

const FT = 0.3048
/** Open ground south-east of Scheme C's cabins (site metres), as in the 4A spec. */
const SPOT = { x: 15, n: -12 }
const ONE_MINUTE_MS = 60_000

type Pos = { x: number; n: number }
type Obj = { id: string; type: string; name: string; position: Pos; locked: boolean }

const selected = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    return s.selection.map((id: string) => structuredClone(s.plan.objects[id])) as Obj[]
  })
const objectOf = (page: Page, id: string) => page.evaluate((i) => structuredClone((window as any).islandale.store.getState().plan.objects[i]) as Obj | undefined, id)
const screenOf = async (page: Page, p: Pos) => {
  const at = await page.evaluate(({ x, n }) => (window as any).islandale.screenOf(x, n), p)
  expect(at, `site point ${p.x}, ${p.n} is on screen`).toBeTruthy()
  return at as { x: number; y: number }
}

/** A truly new browser: no mode chosen, no tour seen, no saved plan. */
async function asNewcomer(page: Page) {
  await page.goto('/')
  await clearSaves(page, { newcomer: true })
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.screenOf, null, { timeout: 60_000 })
}

test('a new browser opens in Beginner and the five-step tour runs once, points at real controls and never changes the plan', async ({ page }) => {
  test.setTimeout(180_000)
  await asNewcomer(page)
  await expect(page.getByTestId('mode-beginner')).toHaveAttribute('aria-checked', 'true')

  const tour = page.getByTestId('tour')
  await expect(tour).toBeVisible({ timeout: 20_000 })
  const plan = await page.evaluate(() => JSON.stringify((window as any).islandale.store.getState().plan))
  for (const step of ['orbit', 'select', 'move', 'lock', 'save']) {
    await expect(tour).toHaveAttribute('data-step', step)
    await expect(tour).toBeInViewport()
    await page.getByTestId('tour-next').click()
  }
  await expect(tour).toHaveCount(0)
  expect(await page.evaluate(() => JSON.stringify((window as any).islandale.store.getState().plan))).toBe(plan)
  expect(await page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)).toBe(0)

  // remembered: a reload doesn't start it again
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForTimeout(1500)
  await expect(tour).toHaveCount(0)

  // Help replays it; Back works; Escape ends it
  await page.getByTestId('open-help').click()
  await page.getByTestId('take-tour').click()
  await expect(tour).toHaveAttribute('data-step', 'orbit')
  await page.getByTestId('tour-next').click()
  await page.getByTestId('tour-back').click()
  await expect(tour).toHaveAttribute('data-step', 'orbit')
  await page.keyboard.press('Escape')
  await expect(tour).toHaveCount(0)
})

test('the one-minute walk: in Beginner, place a cabin, move it, lock it and save, with Delete asking first', async ({ page }) => {
  test.setTimeout(240_000)
  await asNewcomer(page)
  await expect(page.getByTestId('tour')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('tour-skip').click()
  await page.evaluate(({ x, n }) => (window as any).islandale.lookAtSite(x, n, 28, 38), SPOT)
  const started = Date.now()

  // place: the Place tool, a cabin from the library, a click on the ground
  await page.getByTestId('tool-place').click()
  await page.getByTestId('library-guest-cabin').click()
  const p = await screenOf(page, SPOT)
  await page.mouse.move(p.x - 6, p.y - 6)
  await page.mouse.move(p.x, p.y, { steps: 3 })
  await page.mouse.click(p.x, p.y)
  await expect.poll(async () => (await selected(page))[0]?.name ?? '', { timeout: 20_000 }).toBe('Guest cabin')
  const [cabin] = await selected(page)

  // Beginner names and hides: "Turned", no Pitch or Overhang
  await expect(page.getByLabel('Turned')).toBeVisible()
  await expect(page.getByLabel('How tall the walls are')).toBeVisible()
  await page.getByTestId('section-roof').click()
  await expect(page.getByLabel('Roof shape')).toBeVisible()
  await expect(page.locator('[data-term="pitch"]')).toHaveCount(0)

  // move: drag it across the ground
  const from = await screenOf(page, cabin.position)
  const to = await screenOf(page, { x: cabin.position.x + 6, n: cabin.position.n })
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => (await objectOf(page, cabin.id))?.position.x ?? 0, { timeout: 20_000 }).toBeGreaterThan(cabin.position.x + 2 * FT)

  // Delete asks first in Beginner; Cancel keeps it
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('confirm-dialog')).toContainText('Delete the Guest cabin?')
  await page.getByTestId('confirm-cancel').click()
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
  expect(await objectOf(page, cabin.id)).toBeTruthy()

  // lock: open Visibility and lock, tick Locked
  await page.getByTestId('section-visibility').click()
  await page.getByTestId('object-locked').check()
  await expect.poll(async () => (await objectOf(page, cabin.id))?.locked).toBe(true)

  // save: it saves itself, and the top bar says so
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  expect(Date.now() - started, 'the walk takes about a minute at most').toBeLessThan(ONE_MINUTE_MS)

  // and it's still there, locked, after a reload
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await expect.poll(async () => (await objectOf(page, cabin.id))?.locked, { timeout: 20_000 }).toBe(true)
})

test('Advanced shows every roof field again with its value, and deletes without asking', async ({ page }) => {
  test.setTimeout(180_000)
  await asNewcomer(page)
  await page.getByTestId('tour-skip').click()
  await page.getByTestId('mode-advanced').click()
  const id = await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    const cabin = s.plan.order.find((i: string) => s.plan.objects[i].type === 'house')
    s.select([cabin])
    return cabin as string
  })
  await page.getByTestId('section-roof').click()
  await expect(page.locator('[data-term="pitch"]')).toBeVisible()
  await expect(page.locator('[data-term="overhang"]')).toBeVisible()
  await page.locator('canvas').first().focus().catch(() => undefined)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
  await expect.poll(() => objectOf(page, id)).toBeUndefined()
  // the choice is remembered
  await page.reload()
  await expect(page.getByTestId('mode-advanced')).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 })
})

test('the confirm dialog shows over the interior editor: removing a floor asks first, then removes it', async ({ page }) => {
  test.setTimeout(180_000)
  await asNewcomer(page)
  await page.getByTestId('tour-skip').click()
  await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    const cabin = s.plan.order.find((i: string) => s.plan.objects[i].type === 'house')
    s.setObjectParams(cabin, { h: 18 }) // an upper floor needs 15 ft walls
    s.select([cabin])
  })
  await page.getByTestId('open-interior').click()
  const floorCount = () =>
    page.evaluate(() => {
      const s = (window as any).islandale.store.getState()
      return (s.plan.objects[s.selection[0]].params.floors ?? []).length as number
    })
  const before = await floorCount()
  await page.getByTestId('add-floor').click()
  await expect.poll(floorCount).toBeGreaterThan(before)
  const withUpper = await floorCount()
  await page.getByTestId('remove-floor').click()
  await expect(page.getByTestId('confirm-dialog')).toContainText('Remove')
  // a click fails if anything covers the dialog
  await page.getByTestId('confirm-yes').click()
  await expect.poll(floorCount).toBe(withUpper - 1)
})


test('Beginner shows no code check, program budget, accessible route or warning chips; Advanced shows them, Present never shows the chips', async ({ page }) => {
  test.setTimeout(180_000)
  await asNewcomer(page)
  await expect(page.getByTestId('tour')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('tour-skip').click()
  const warningChips = page.locator('[data-testid="route-chip"], [data-testid="step-chip"]')
  const route = page.getByRole('region', { name: 'Accessible route' })

  await page.getByTestId('tab-build').click()
  await expect(page.getByTestId('program-budget')).toHaveCount(0)
  await expect(route).toHaveCount(0)
  await page.waitForTimeout(1000)
  await expect(warningChips).toHaveCount(0)
  await page.getByTestId('tab-site').click()
  await expect(page.getByTestId('code-check')).toHaveCount(0)
  await expect(page.getByTestId('setbacks')).toBeVisible()

  await page.getByTestId('mode-advanced').click()
  await expect(page.getByTestId('code-check')).toBeVisible()
  await page.getByTestId('tab-build').click()
  await expect(page.getByTestId('program-budget')).toBeVisible()
  await expect(route).toBeVisible()
  await expect.poll(() => warningChips.count(), { timeout: 20_000 }).toBeGreaterThan(0)

  await page.getByTestId('tab-present').click()
  await expect(warningChips).toHaveCount(0)
})
