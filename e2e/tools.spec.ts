import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Phase 4A done-when: from Scheme C, place a cabin, a tree and a pad from
 * the library, duplicate one, drag it with snapping, and turn it with
 * Q / E / R. Each step is one undo step and is refused on a locked layer.
 */

const FT = 0.3048
/** Open ground south-east of Scheme C's cabins (site metres). */
const SPOT = { x: 15, n: -12 }

type Pos = { x: number; n: number }
type Obj = { id: string; type: string; name: string; position: Pos; rotation: number }

const steps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length as number)
const count = (page: Page) => page.evaluate(() => (window as any).islandale.store.getState().plan.order.length as number)
const selected = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    return s.selection.map((id: string) => structuredClone(s.plan.objects[id])) as Obj[]
  })
const screenOf = async (page: Page, p: Pos) => {
  const at = await page.evaluate(({ x, n }) => (window as any).islandale.screenOf(x, n), p)
  expect(at, `site point ${p.x}, ${p.n} is on screen`).toBeTruthy()
  return at as { x: number; y: number }
}
const onWholeFeet = (p: Pos) => {
  expect(Math.abs(p.x / FT - Math.round(p.x / FT))).toBeLessThan(1e-6)
  expect(Math.abs(p.n / FT - Math.round(p.n / FT))).toBeLessThan(1e-6)
}

async function placeFromLibrary(page: Page, item: string, at: Pos) {
  const library = page.getByTestId('library')
  if (!(await library.isVisible())) await page.getByTestId('tool-place').click()
  await page.getByTestId(`library-${item}`).click()
  await expect(page.getByTestId('mode-chip')).toContainText('Placing')
  const p = await screenOf(page, at)
  await page.mouse.move(p.x - 6, p.y - 6)
  await page.mouse.move(p.x, p.y, { steps: 3 })
  await page.mouse.click(p.x, p.y)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.screenOf, null, { timeout: 60_000 })
  await page.evaluate(({ x, n }) => {
    const w = (window as any).islandale
    w.store.getState().loadScheme('C')
    w.store.getState().setSnap(true)
    w.store.temporal.getState().clear()
    w.lookAtSite(x, n, 28, 38)
  }, SPOT)
})

test('place a cabin, a tree and a pad, duplicate, drag with snapping and turn with Q / E / R, each one undo step', async ({ page }) => {
  test.setTimeout(240_000)
  const n0 = await count(page)

  // place: one undo step each, selected, back on Select, on whole feet
  await placeFromLibrary(page, 'guest-cabin', SPOT)
  await expect.poll(() => count(page), { timeout: 20_000 }).toBe(n0 + 1)
  const [cabin] = await selected(page)
  expect(cabin).toMatchObject({ type: 'house', name: 'Guest cabin' })
  onWholeFeet(cabin.position)
  expect(await steps(page)).toBe(1)
  await expect(page.getByTestId('mode-chip')).toHaveCount(0)

  // trees and driveways are in the Site tab's library (4B)
  await page.getByTestId('tab-site').click()
  await placeFromLibrary(page, 'red-alder', { x: SPOT.x + 14, n: SPOT.n })
  await expect.poll(() => count(page), { timeout: 20_000 }).toBe(n0 + 2)
  expect((await selected(page))[0]).toMatchObject({ type: 'tree', name: 'Red alder' })

  // clear of Scheme C's Path to beach (14, -22.5), which would take the click
  await placeFromLibrary(page, 'driveway', { x: SPOT.x + 14, n: SPOT.n - 14 })
  await expect.poll(() => count(page), { timeout: 20_000 }).toBe(n0 + 3)
  expect((await selected(page))[0]).toMatchObject({ type: 'pad', name: 'Driveway' })
  expect(await steps(page)).toBe(3)

  // duplicate the cabin: 5 ft east and south, the copy selected
  await page.evaluate((id) => (window as any).islandale.store.getState().select([id]), cabin.id)
  await page.keyboard.press('ControlOrMeta+d')
  await expect.poll(() => count(page)).toBe(n0 + 4)
  const [copy] = await selected(page)
  expect(copy.id).not.toBe(cabin.id)
  expect(copy.position.x).toBeCloseTo(cabin.position.x + 5 * FT, 6)
  expect(copy.position.n).toBeCloseTo(cabin.position.n - 5 * FT, 6)
  expect(await steps(page)).toBe(4)

  // drag the copy across the ground: it moves, lands on whole feet, one undo step
  const from = await screenOf(page, copy.position)
  const to = await screenOf(page, { x: copy.position.x + 6, n: copy.position.n })
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => (await selected(page))[0]?.position.x ?? 0, { timeout: 20_000 }).toBeGreaterThan(copy.position.x + 2)
  const [dragged] = await selected(page)
  expect(dragged.id).toBe(copy.id)
  onWholeFeet(dragged.position)
  expect(await steps(page)).toBe(5)

  // Q / E turn 5°, R a quarter, each one undo step
  const turn = async (key: string, by: number, step: number) => {
    const before = (await selected(page))[0].rotation
    await page.keyboard.press(key)
    await expect.poll(async () => (await selected(page))[0].rotation).toBeCloseTo(((before + by + 540) % 360) - 180, 6)
    expect(await steps(page)).toBe(step)
  }
  await turn('e', 5, 6)
  await turn('q', -5, 7)
  await turn('r', 90, 8)

  // undo walks back through them one at a time
  await page.evaluate(() => (window as any).islandale.store.temporal.getState().undo())
  expect((await selected(page))[0].rotation).toBeCloseTo(dragged.rotation, 6)
})

test('placing is refused on a locked layer, and switching tools is never an undo step', async ({ page }) => {
  test.setTimeout(120_000)
  const n0 = await count(page)
  await page.getByTestId('tool-place').click()
  await page.getByTestId('library-guest-cabin').click()
  await page.getByTestId('tool-select').click()
  await page.keyboard.press('c')
  await page.keyboard.press('Escape')
  expect(await steps(page)).toBe(0)

  await page.evaluate(() => (window as any).islandale.store.getState().setLayer('buildings', { locked: true }))
  await placeFromLibrary(page, 'guest-cabin', SPOT)
  await expect(page.getByRole('status').filter({ hasText: 'Buildings are locked' })).toBeVisible({ timeout: 10_000 })
  expect(await count(page)).toBe(n0)
  expect(await steps(page)).toBe(0)
})
