import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Phase 5B done-when: open any Scheme C cabin, see its floor plan from the
 * data, change a room, add a door and a bed, go upstairs, and see all of it
 * in 3D with the roof off; every edit one undo step, and a lock refuses them.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.interiorStats, null, { timeout: 60_000 })
})

const store = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([fn, args]) => (window as any).islandale.store.getState()[fn as string](...(args as unknown[])), [fn, args] as const)
const floors = (page: Page, id: string) => page.evaluate((id) => structuredClone((window as any).islandale.store.getState().plan.objects[id].params.floors ?? []), id)
const pastSteps = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().pastStates.length)
const houses = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    return s.plan.order.filter((id: string) => s.plan.objects[id].type === 'house')
  })

async function openInterior(page: Page, id: string) {
  await store(page, 'select', [id])
  await page.getByTestId('open-interior').click()
  await expect(page.getByTestId('interior-plan')).toBeVisible()
}

/** Screen points of a room's outline, read from its plan polygon. */
async function roomPoints(page: Page, roomId: number): Promise<[number, number][]> {
  const poly = page.locator(`polygon[data-room="${roomId}"]`).first()
  const box = (await page.getByTestId('interior-plan').boundingBox())!
  const pts = (await poly.getAttribute('points'))!.split(' ').map((p) => p.split(',').map(Number) as [number, number])
  return pts.map(([x, y]) => [box.x + x, box.y + y])
}

const centre = (pts: [number, number][]): [number, number] => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]

test('every Scheme C cabin opens to its floor plan from the data', async ({ page }) => {
  test.setTimeout(120_000)
  await store(page, 'loadScheme', 'C')
  for (const id of await houses(page)) {
    const fl = await floors(page, id)
    await openInterior(page, id)
    await expect(page.locator('polygon[data-room]')).toHaveCount(fl[0]?.rooms?.length ?? 0)
    await expect(page.locator('[data-opening]')).toHaveCount(fl[0]?.openings?.length ?? 0)
    await page.getByTestId('interior-close').click()
    await expect(page.getByTestId('interior-plan')).toHaveCount(0)
  }
})

test('change a room, add a door and a bed, go upstairs, and see it all in 3D with the roof off', async ({ page }) => {
  test.setTimeout(180_000)
  await store(page, 'loadScheme', 'C')
  const id = 'C-0'
  const hall = (await floors(page, id))[0].rooms.find((r: { name: string }) => r.name === 'Hearth hall')
  await openInterior(page, id)
  const steps0 = await pastSteps(page)

  // change a room: select it and rename it
  const pts = await roomPoints(page, hall.id)
  await page.mouse.click(...centre(pts))
  const panel = page.getByRole('region', { name: 'Room' })
  await expect(panel).toBeVisible()
  const name = panel.getByLabel('Name')
  await name.fill('Great hall')
  await name.press('Enter')
  await expect.poll(async () => (await floors(page, id))[0].rooms.find((r: { id: number }) => r.id === hall.id).name).toBe('Great hall')
  expect(await pastSteps(page)).toBe(steps0 + 1)

  // add a door on the hall's lowest wall
  const doors0 = (await floors(page, id))[0].openings.length
  await page.getByTestId('tool-door').click()
  const low = [...pts].sort((a, b) => b[1] - a[1]).slice(0, 2)
  const mid: [number, number] = [(low[0][0] + low[1][0]) / 2 - 12, (low[0][1] + low[1][1]) / 2 - 2]
  await page.mouse.move(...mid)
  await page.mouse.click(...mid)
  await expect.poll(async () => (await floors(page, id))[0].openings.length).toBe(doors0 + 1)
  expect(await pastSteps(page)).toBe(steps0 + 2)

  // add a queen bed in the hall
  const beds0 = (await floors(page, id))[0].furniture.filter((f: { type: string }) => f.type === 'queen').length
  await page.getByTestId('furn-queen').click()
  await page.mouse.move(...centre(pts))
  await page.mouse.click(...centre(pts))
  await expect.poll(async () => (await floors(page, id))[0].furniture.filter((f: { type: string }) => f.type === 'queen').length).toBe(beds0 + 1)
  await page.keyboard.press('Escape')

  // go upstairs: an upper floor needs 15 ft walls; a spiral stair below and its top above
  await page.getByTestId('interior-close').click()
  await store(page, 'setObjectParams', id, { h: 18 })
  await openInterior(page, id)
  await page.getByTestId('furn-spiral').click()
  await page.mouse.click(...centre(pts))
  await page.getByTestId('add-floor').click()
  await expect(page.getByRole('button', { name: 'Upper floor', exact: true })).toHaveClass(/on/)
  await expect(page.locator('polygon[data-room]')).toHaveCount(0)
  await page.getByTestId('furn-spiraldn').click()
  await page.mouse.click(...centre(pts))
  // a room upstairs, dragged out with the Room tool across the floor
  await page.getByTestId('tool-room').click()
  const [cx, cy] = centre(pts)
  await page.mouse.move(cx - 80, cy - 60)
  await page.mouse.down()
  await page.mouse.move(cx + 80, cy + 60, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await floors(page, id))[1]?.rooms.length ?? 0).toBeGreaterThan(0)
  await expect.poll(async () => (await floors(page, id))[1].furniture.some((f: { type: string }) => f.type === 'spiraldn')).toBe(true)

  // all of it in 3D with the roof off
  await page.getByTestId('interior-close').click()
  await page.getByTestId('roofs-off').click()
  await expect
    .poll(async () => page.evaluate((id) => (window as any).islandale.interiorStats(id), id), { timeout: 30_000 })
    .toMatchObject({ wall: expect.any(Number), furniture: expect.any(Number), slab: expect.any(Number), stair: expect.any(Number), rail: expect.any(Number) })
})

test('a locked cabin refuses floor-plan edits, and undo takes an edit back', async ({ page }) => {
  test.setTimeout(120_000)
  await store(page, 'loadScheme', 'C')
  const id = 'C-0'
  const before = await floors(page, id)
  const hall = before[0].rooms.find((r: { name: string }) => r.name === 'Hearth hall')
  await store(page, 'setLocked', id, true)
  await openInterior(page, id)
  await page.getByTestId('furn-queen').click()
  const pts = await roomPoints(page, hall.id)
  await page.mouse.click(...centre(pts))
  await expect(page.getByRole('status')).toContainText(/locked/i)
  expect(await floors(page, id)).toEqual(before)

  await store(page, 'setLocked', id, false)
  await page.mouse.click(...centre(pts))
  await expect.poll(async () => (await floors(page, id))[0].furniture.length).toBe(before[0].furniture.length + 1)
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await floors(page, id))[0].furniture.length).toBe(before[0].furniture.length)
})
