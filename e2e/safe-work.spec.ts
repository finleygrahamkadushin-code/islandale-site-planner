import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'
import { openSection } from './inspector'

/** Phase 3C lost-work drills for the new app. */

const ready = (page: Page) => expect(page.getByTestId('save-status')).toHaveText(/Saved|Not saved/, { timeout: 30_000 })

async function freshStart(page: Page) {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await ready(page)
}

const renameFirstHouse = (page: Page, name: string) =>
  page.evaluate((name) => {
    const s = (window as any).islandale.store.getState()
    const id = s.plan.order.find((i: string) => s.plan.objects[i].type === 'house')
    s.renameObject(id, name)
    return id as string
  }, name)

const nameOf = (page: Page, id: string) =>
  page.evaluate((id) => (window as any).islandale.store.getState().plan.objects[id].name as string, id)

test('an edit made just before the tab closes is there when the plan reopens', async ({ context }) => {
  test.setTimeout(120_000)
  const page = await context.newPage()
  await freshStart(page)
  const id = await renameFirstHouse(page, 'Closed straight away')
  await page.close({ runBeforeUnload: true })

  const again = await context.newPage()
  await again.goto('/')
  await ready(again)
  expect(await nameOf(again, id)).toBe('Closed straight away')
})

test('a second tab opens read-only until it takes over editing', async ({ context }) => {
  test.setTimeout(120_000)
  const first = await context.newPage()
  await freshStart(first)
  const second = await context.newPage()
  await second.goto('/')
  await expect(second.getByTestId('read-only')).toContainText('another tab', { timeout: 30_000 })

  // The second tab refuses edits while read-only.
  const id = await renameFirstHouse(second, 'Should not stick')
  expect(await nameOf(second, id)).not.toBe('Should not stick')

  // The first tab edits; the second takes over and sees that edit.
  await renameFirstHouse(first, 'Edited in the first tab')
  await second.getByRole('button', { name: 'Take over editing' }).click()
  await expect(second.getByTestId('read-only')).toHaveCount(0, { timeout: 10_000 })
  await expect.poll(() => nameOf(second, id)).toBe('Edited in the first tab')
  await expect(first.getByTestId('read-only')).toContainText('another tab')
})

test('History lists the saves and restores one as an undoable step', async ({ page }) => {
  test.setTimeout(120_000)
  await freshStart(page)
  const id = await renameFirstHouse(page, 'Before restore')
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 15_000 })
  await page.reload()
  await ready(page)
  await renameFirstHouse(page, 'After the reload')
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 15_000 })

  await page.getByRole('button', { name: 'History' }).click()
  const list = page.getByTestId('history-list')
  await expect(list).toContainText('opened')
  // The newest entry is the rename; the one below it is the plan as it was opened.
  await list.getByRole('menuitem', { name: 'Restore' }).nth(1).click()
  expect(await nameOf(page, id)).toBe('Before restore')
  await page.evaluate(() => (window as any).islandale.store.temporal.getState().undo())
  expect(await nameOf(page, id)).toBe('After the reload')
})

test('the Openings panel adds and resizes a window as undoable steps, and a locked cabin refuses', async ({ page }) => {
  test.setTimeout(120_000)
  await freshStart(page)
  const id = await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    const id = s.plan.order.find((i: string) => s.plan.objects[i].name === 'Family lantern')
    s.select([id])
    return id as string
  })
  const cuts = () => page.evaluate((id) => ((window as any).islandale.store.getState().plan.objects[id].params.cuts ?? []).length as number, id)
  const before = await cuts()
  await openSection(page, 'openings')
  const panel = page.locator('.inspector-section.openings')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: '+ Window' }).click()
  expect(await cuts()).toBe(before + 1)

  // the new window is the last row on its wall: make it 2' 6" wide
  const row = panel.getByTestId('opening-row').last()
  const width = row.getByLabel('Width')
  await width.fill(`2' 6"`)
  await width.press('Enter')
  await expect(width).toHaveValue(`2' 6"`)
  await page.evaluate(() => (window as any).islandale.store.temporal.getState().undo())
  await page.evaluate(() => (window as any).islandale.store.temporal.getState().undo())
  expect(await cuts()).toBe(before)

  // locked: the panel's buttons are disabled and the store refuses
  await openSection(page, 'visibility')
  await page.getByLabel('Locked').check()
  await expect(panel.getByRole('button', { name: '+ Window' })).toBeDisabled()
  await page.evaluate((id) => (window as any).islandale.store.getState().addOpening(id, 0, { kind: 'window', edge: 0, x: 1, w: 2, h: 3, sill: 3 }), id)
  expect(await cuts()).toBe(before)
})

const undoSteps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length as number)
const selectHouse = (page: Page, n: number) =>
  page.evaluate((n) => {
    const s = (window as any).islandale.store.getState()
    const id = s.plan.order.filter((i: string) => s.plan.objects[i].type === 'house')[n]
    s.select([id])
    return id as string
  }, n)

test('a colour dragged through in the inspector is one undo step (R6.3)', async ({ page }) => {
  test.setTimeout(120_000)
  await freshStart(page)
  const id = await selectHouse(page, 0)
  await openSection(page, 'look')
  const well = page.getByTestId('object-color')
  await expect(well).toBeVisible()
  const before = await undoSteps(page)
  // the native picker sends input events while a shade is dragged through, and change when it closes
  await well.evaluate((el: HTMLInputElement) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    for (const c of ['#112233', '#223344', '#334455']) {
      setValue.call(el, c)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect.poll(() => page.evaluate((id) => (window as any).islandale.store.getState().plan.objects[id].params.color, id)).toBe('#334455')
  expect(await undoSteps(page)).toBe(before + 1)
})

test('a refused size says why, Escape puts it back, and the message does not follow the selection (R6.1, R6.4)', async ({ page }) => {
  test.setTimeout(120_000)
  await freshStart(page)
  const a = await selectHouse(page, 0)
  const b = await page.evaluate((a) => {
    const s = (window as any).islandale.store.getState()
    const b = s.plan.order.filter((i: string) => s.plan.objects[i].type === 'house')[1]
    s.resizeObject(b, { w: s.plan.objects[a].params.w, d: s.plan.objects[b].params.d })
    return b as string
  }, a)
  const inspector = page.getByLabel('Inspector')
  const width = page.locator('.inspector-section', { has: page.getByTestId('section-size') }).getByLabel('Width').first()
  const shown = await width.inputValue()
  await width.fill('99999')
  await width.press('Enter')
  await expect(inspector).toContainText('At most 300 ft')
  await width.press('Escape')
  await expect(width).toHaveValue(shown)
  await expect(inspector).not.toContainText('At most 300 ft')

  await width.fill('99999')
  await width.press('Enter')
  await expect(inspector).toContainText('At most 300 ft')
  await page.evaluate((b) => (window as any).islandale.store.getState().select([b]), b)
  await expect(inspector.getByLabel('Name')).toHaveValue(await nameOf(page, b))
  await expect(inspector).not.toContainText('At most 300 ft')
})
