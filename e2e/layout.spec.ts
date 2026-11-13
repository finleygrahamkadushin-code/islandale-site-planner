import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Phase 4B done-when: every tool and panel sits in one tab; the inspector
 * reads by heading; from the Site tab you can measure between two cabins
 * and read the ground under the pointer; Shift-drag selects a group and a
 * drag moves it as one undo step; Cmd+K runs "Lock all", "Golden hour" and
 * "Place Guest cabin".
 */

type Pos = { x: number; n: number }
const steps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length as number)
const state = <T,>(page: Page, f: string) => page.evaluate((f) => new Function('s', `return ${f}`)((window as any).islandale.store.getState()), f) as Promise<T>
const screenOf = async (page: Page, p: Pos) => (await page.evaluate(({ x, n }) => (window as any).islandale.screenOf(x, n), p)) as { x: number; y: number }
const pos = (page: Page, id: string) => state<Pos>(page, `structuredClone(s.plan.objects['${id}'].position)`)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.screenOf, null, { timeout: 60_000 })
  await page.evaluate(() => {
    const w = (window as any).islandale
    w.store.getState().loadScheme('C')
    w.store.getState().select([])
    w.store.temporal.getState().clear()
    w.lookAtSite(-6, 3, 32, 46)
  })
})

test('tabs: each shows its own tools and panels, and switching keeps the selection without an undo step', async ({ page }) => {
  test.setTimeout(120_000)
  await expect(page.getByTestId('tab-build')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('paint-tool')).toBeVisible()
  await page.getByTestId('tab-site').click()
  await expect(page.getByTestId('lot-facts')).toContainText('20,847 sq ft')
  await expect(page.getByTestId('legend')).toBeVisible()
  await expect(page.getByTestId('tool-measure')).toBeVisible()
  await expect(page.getByTestId('paint-tool')).toHaveCount(0)
  await page.evaluate(() => (window as any).islandale.store.getState().select(['C-0']))
  for (const t of ['interior', 'present', 'build', 'site']) await page.getByTestId(`tab-${t}`).click()
  expect(await state<string[]>(page, 's.selection')).toEqual(['C-0'])
  await expect(page.getByTestId('section-placement')).toHaveAttribute('data-state', 'open')
  await expect(page.getByTestId('selection-stats')).toContainText('sq ft')
  expect(await steps(page)).toBe(0)
})

test('measure between two cabins from the Site tab, and read the ground under the pointer', async ({ page }) => {
  test.setTimeout(120_000)
  await page.getByTestId('tab-site').click()
  const open = await screenOf(page, { x: 8, n: -8 })
  await page.mouse.move(open.x, open.y)
  await expect(page.getByTestId('pointer-readout')).toContainText(/Ground [\d.]+ ft NAVD88 · slope \d+ %/)
  await page.keyboard.press('m')
  await expect(page.getByTestId('mode-chip')).toContainText('Measure')
  const a = await screenOf(page, await pos(page, 'C-0'))
  const b = await screenOf(page, await pos(page, 'C-3'))
  await page.mouse.click(a.x, a.y)
  await page.mouse.click(b.x, b.y)
  await expect.poll(() => state<number>(page, 's.measurements.length')).toBe(1)
  // drei's Html doesn't pass test ids through, so the label is found by its class
  await expect(page.locator('.measure-label').first()).toContainText('across')
  expect(await state<number>(page, 's.measurements[0].horizontalM')).toBeGreaterThan(5)
  expect(await steps(page)).toBe(0)
  await page.getByTestId('clear-measurements').click()
  expect(await state<number>(page, 's.measurements.length')).toBe(0)
})

test('Shift-drag on the ground selects a group, and dragging one moves them all as one undo step', async ({ page }) => {
  test.setTimeout(150_000)
  const from = await screenOf(page, { x: 6, n: -6 })
  const to = await screenOf(page, { x: -18, n: 16 })
  await page.keyboard.down('Shift')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  const sel = await state<string[]>(page, 's.selection')
  expect(sel).toContain('C-0')
  expect(sel.length).toBeGreaterThan(1)
  await expect(page.getByTestId('align-west')).toBeVisible()

  const before = await Promise.all(sel.map((id) => pos(page, id)))
  const c0 = before[sel.indexOf('C-0')]
  const grab = await screenOf(page, c0)
  const drop = await screenOf(page, { x: c0.x + 4, n: c0.n })
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(drop.x, drop.y, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await pos(page, 'C-0')).x, { timeout: 20_000 }).toBeGreaterThan(c0.x + 1)
  const dx = (await pos(page, 'C-0')).x - c0.x
  const after = await Promise.all(sel.map((id) => pos(page, id)))
  after.forEach((p, i) => expect(p.x - before[i].x).toBeCloseTo(dx, 6))
  expect(await steps(page)).toBe(1)
})

test('Shift-click adds and removes: the ground behind an object starts no box, and one click toggles once', async ({ page }) => {
  test.setTimeout(120_000)
  const click = async (id: string) => {
    const at = await screenOf(page, await pos(page, id))
    await page.keyboard.down('Shift')
    await page.mouse.click(at.x, at.y)
    await page.keyboard.up('Shift')
  }
  await click('C-0')
  await click('C-3')
  await expect.poll(() => state<string[]>(page, '[...s.selection].sort()')).toEqual(['C-0', 'C-3'])
  await click('C-3')
  await expect.poll(() => state<string[]>(page, 's.selection')).toEqual(['C-0'])
})

test('Add to selection: without Shift, clicks add and remove and a ground drag boxes more (R10.2)', async ({ page }) => {
  test.setTimeout(150_000)
  await page.getByTestId('tool-add-select').click()
  await expect(page.getByTestId('tool-add-select')).toHaveAttribute('aria-pressed', 'true')
  for (const id of ['C-0', 'C-3']) {
    const at = await screenOf(page, await pos(page, id))
    await page.mouse.click(at.x, at.y)
  }
  await expect.poll(() => state<string[]>(page, '[...s.selection].sort()')).toEqual(['C-0', 'C-3'])
  const again = await screenOf(page, await pos(page, 'C-3'))
  await page.mouse.click(again.x, again.y)
  await expect.poll(() => state<string[]>(page, 's.selection')).toEqual(['C-0'])
  // a plain drag on empty ground boxes, and the box adds to what is picked
  const from = await screenOf(page, { x: 6, n: -6 })
  const to = await screenOf(page, { x: -18, n: 16 })
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
  const sel = await state<string[]>(page, 's.selection')
  expect(sel[0]).toBe('C-0')
  expect(sel.length).toBeGreaterThan(1)
  expect(await steps(page)).toBe(0)
  await page.getByTestId('tool-add-select').click()
  const one = await screenOf(page, await pos(page, 'C-3'))
  await page.mouse.click(one.x, one.y)
  await expect.poll(() => state<string[]>(page, 's.selection')).toEqual(['C-3'])
})

test('Cmd+K finds and runs "Lock all", "Golden hour" and "Place Guest cabin"', async ({ page }) => {
  test.setTimeout(120_000)
  const run = async (text: string) => {
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByTestId('command-input').fill(text)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('command-input')).toHaveCount(0)
  }
  await run('lock all')
  expect(await state<boolean>(page, 'Object.values(s.layers).every((l) => l.locked)')).toBe(true)
  await run('golden hour')
  expect(await state<string>(page, 's.viewRequest.id')).toBe('sunset')
  await run('place guest cabin')
  expect(await state<string>(page, 's.placing.item')).toBe('guest-cabin')
  await page.keyboard.press('?')
  await expect(page.getByTestId('help-sheet')).toContainText('Measure between two points')
})
