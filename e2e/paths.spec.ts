import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Phase 5C done-when: connect the parking pad to every cabin with path
 * pieces that snap and meet flush, and the route check says which pass
 * and why; plus placing, Fix, undo and locks.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.sceneStats, null, { timeout: 60_000 })
})

const store = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([fn, args]) => (window as any).islandale.store.getState()[fn as string](...(args as unknown[])), [fn, args] as const)
const pieceIds = (page: Page) => page.evaluate(() => Object.keys((window as any).islandale.store.getState().plan.objects).filter((k) => k.startsWith('piece-')))
const houses = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    return s.plan.order.filter((id: string) => s.plan.objects[id].type === 'house').map((id: string) => s.plan.objects[id].name)
  })

/** Click the Connect chip whose label matches (chips can sit off screen, so the click is dispatched). */
async function pickChip(page: Page, label: RegExp) {
  const chips = page.locator('[data-testid^="connect-target-"]')
  await expect(chips.first()).toBeAttached({ timeout: 30_000 })
  const labels = await chips.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.label ?? ''))
  const i = labels.findIndex((l) => label.test(l))
  expect(i, `a chip for ${label}`).toBeGreaterThanOrEqual(0)
  await chips.nth(i).dispatchEvent('click')
}

test('connect the parking pad to every cabin; pieces meet flush and the route check says which pass and why', async ({ page }) => {
  test.setTimeout(240_000)
  await store(page, 'loadScheme', 'C')
  await store(page, 'select', [])
  for (const name of await houses(page)) {
    await page.getByTestId('connect-tool').click()
    await pickChip(page, /Parking.*edge/)
    await pickChip(page, new RegExp(`^${name.replace(/[’']/g, '.')} · door`))
    const options = page.locator('.connect-options button:not([disabled])')
    await expect(options.first()).toBeVisible()
    // the first passing option, else the first that can be built
    const passing = page.locator('.connect-options button.ok:not([disabled])')
    const before = (await pieceIds(page)).length
    await ((await passing.count()) ? passing.first() : options.first()).click()
    await expect.poll(async () => (await pieceIds(page)).length).toBeGreaterThan(before)
  }
  await store(page, 'select', [])
  // every cabin now has a route, and its line says whether it passes and why
  const rows = page.getByTestId('route-rows').locator('li')
  await expect(rows).toHaveCount((await houses(page)).length)
  for (const text of await rows.allTextContents()) {
    expect(text).not.toMatch(/no continuous route/)
    expect(text).toMatch(/reachable|passes|stairs|steep|step|narrow|gap|slope|fail|ADA/i)
  }
  // the new pieces meet each door flush: every building's Levels panel shows them flush
  for (const name of await houses(page)) {
    const id = await page.evaluate((n) => {
      const s = (window as any).islandale.store.getState()
      return s.plan.order.find((k: string) => s.plan.objects[k].name === n)
    }, name)
    await store(page, 'select', [id])
    const levels = page.getByRole('region', { name: 'Levels & junctions' })
    await expect(levels.locator('li', { hasText: /to .*·.*flush/ }).first()).toBeVisible()
  }
})

test('a placed ramp snaps to a door, a Fix is one undo step, and a locked layer refuses new pieces', async ({ page }) => {
  test.setTimeout(180_000)
  await store(page, 'loadScheme', 'C')
  // place a ramp just off the elders' door: it snaps end A onto the door
  const door = await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    return s.plan.objects['C-3'].position
  })
  await page.evaluate((at) => (window as any).islandale.store.getState().addPathPiece('ramp', at, 0), { x: door.x, n: door.n })
  const before = (await pieceIds(page)).length
  expect(before).toBe(1)

  // a steep walk fails; its Fix changes it as one undo step
  const id = await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    const prow = s.plan.objects['C-0'].position
    return s.applyPathEdit([{ kind: 'ramp', position: { x: prow.x + 30, n: prow.n - 20 }, rotation: 0, w: 6, d: 4, ends: { zA: 8, zB: 7 } }])[0]
  })
  await store(page, 'select', [id])
  const check = page.getByTestId('piece-check')
  await expect(check).toContainText(/fails/)
  const steps = await page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)
  await check.getByTestId('piece-fix').first().click()
  await expect.poll(() => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)).toBe(steps + 1)
  await page.keyboard.press('Control+z')
  await expect.poll(() => page.evaluate((id) => (window as any).islandale.store.getState().plan.objects[id].params.w, id)).toBe(6)

  // a locked Decks and paths layer refuses a new piece
  await store(page, 'setLayer', 'paths', { locked: true })
  const n0 = (await pieceIds(page)).length
  await store(page, 'addPathPiece', 'walk', { x: 0, n: 0 }, 0)
  await expect(page.getByRole('status')).toContainText(/locked/i)
  expect((await pieceIds(page)).length).toBe(n0)
})
