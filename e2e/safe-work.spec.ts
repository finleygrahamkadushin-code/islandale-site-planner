import { expect, test, type Page } from '@playwright/test'

/** Phase 3C lost-work drills for the new app. */

const ready = (page: Page) => expect(page.getByTestId('save-status')).toHaveText(/Saved|Not saved/, { timeout: 30_000 })

async function freshStart(page: Page) {
  await page.goto('/')
  await page.evaluate(() => {
    indexedDB.deleteDatabase('keyval-store')
    localStorage.clear()
  })
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
