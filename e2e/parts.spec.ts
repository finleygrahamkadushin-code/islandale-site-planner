import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/** Phase 5A: Scheme C's parts can be picked, resized, added and removed, and each rail edge switched, with undo and locks. */

const SCHEMES = ['C', 'C2', 'C3', 'C4']

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.railedEdges, null, { timeout: 60_000 })
})

const load = (page: Page, scheme: string) => page.evaluate((s) => (window as any).islandale.store.getState().loadScheme(s), scheme)
const railedEdges = (page: Page) => page.evaluate(() => (window as any).islandale.railedEdges())
const wings = (page: Page, id: string) =>
  page.evaluate((id) => structuredClone((window as any).islandale.store.getState().plan.objects[id].params.wings ?? []), id)
const undo = (page: Page) => page.evaluate(() => (window as any).islandale.store.temporal.getState().undo())
const store = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([fn, args]) => (window as any).islandale.store.getState()[fn as string](...(args as unknown[])), [fn, args] as const)

/** The first railed deck or porch wing of a building (stair handrails are rails too, but not set per edge): its mass index and the edges drawn. */
async function railedWing(page: Page, id: string): Promise<{ mass: number; edges: number[] }> {
  const all = await railedEdges(page)
  const byMass = all[id] as Record<string, number[]>
  const ws = await wings(page, id)
  const mass = Number(Object.keys(byMass).find((k) => Number(k) > 0 && ['deck', 'porch'].includes(ws[Number(k) - 1]?.kind)))
  expect(mass, `a railed deck or porch on ${id}`).toBeGreaterThan(0)
  return { mass, edges: byMass[mass] }
}

test('C and C2 to C4: switching one rail edge off takes off only that edge, and undo puts it back', async ({ page }) => {
  test.setTimeout(180_000)
  for (const s of SCHEMES) {
    await load(page, s)
    const id = `${s}-0`
    await expect.poll(async () => (await railedEdges(page))[id], { message: s, timeout: 30_000 }).toBeTruthy()
    const before = await railedEdges(page)
    const { mass, edges } = await railedWing(page, id)
    const edge = edges[0]
    await store(page, 'setRail', id, mass, edge, 'off')
    const want = structuredClone(before)
    want[id][mass] = edges.filter((e: number) => e !== edge)
    if (want[id][mass].length === 0) delete want[id][mass]
    await expect.poll(() => railedEdges(page), { message: `${s} off`, timeout: 15_000 }).toEqual(want)
    await undo(page)
    await expect.poll(() => railedEdges(page), { message: `${s} undo`, timeout: 15_000 }).toEqual(before)
  }
})

test('a picked deck shows its rail chips, and a click cycles that edge', async ({ page }) => {
  test.setTimeout(120_000)
  await load(page, 'C')
  const id = 'C-0'
  await expect.poll(async () => (await railedEdges(page))[id], { timeout: 30_000 }).toBeTruthy()
  const { mass, edges } = await railedWing(page, id)
  await store(page, 'pickPart', { objectId: id, mass })
  await page.evaluate((id) => (window as any).islandale.focus(id, 180, 22, 10), id)
  const chip = page.getByTestId(`rail-chip-${mass}-${edges[0]}`)
  await expect(chip).toBeVisible({ timeout: 15_000 })
  // auto → on → off: the second click takes the rail off
  await chip.click({ force: true })
  await chip.click({ force: true })
  await expect.poll(async () => (await railedEdges(page))[id][mass] ?? [], { timeout: 15_000 }).not.toContain(edges[0])
  await expect(page.getByTestId('part-inspector')).toBeVisible()
})

test('a deck can be resized and removed, each one undo step, and a locked cabin refuses both', async ({ page }) => {
  test.setTimeout(120_000)
  await load(page, 'C')
  const id = 'C-0'
  const start = await wings(page, id)
  const mi = 1 + start.findIndex((w: any) => w.kind === 'deck')
  expect(mi).toBeGreaterThan(0)

  await store(page, 'updateWing', id, mi, { w: start[mi - 1].w + 2 })
  expect((await wings(page, id))[mi - 1].w).toBe(start[mi - 1].w + 2)
  await undo(page)
  expect(await wings(page, id)).toEqual(start)

  await store(page, 'removeWing', id, mi)
  expect((await wings(page, id)).length).toBe(start.length - 1)
  await undo(page)
  expect(await wings(page, id)).toEqual(start)

  await store(page, 'setLocked', id, true)
  await store(page, 'updateWing', id, mi, { w: start[mi - 1].w + 2 })
  await store(page, 'removeWing', id, mi)
  expect(await wings(page, id)).toEqual(start)
})

test('a stair can be added off a free edge from its + chip, and undo takes it away', async ({ page }) => {
  test.setTimeout(120_000)
  await load(page, 'C')
  const id = 'C-0'
  const start = await wings(page, id)
  await store(page, 'pickPart', { objectId: id, mass: 0 })
  await page.evaluate((id) => (window as any).islandale.focus(id, 180, 26, 12), id)
  const plus = page.locator('[data-testid^="add-chip-0-"]').first()
  await expect(plus).toBeVisible({ timeout: 15_000 })
  await plus.click({ force: true })
  await page.getByTestId('add-stair').click({ force: true })
  await expect.poll(async () => (await wings(page, id)).length, { timeout: 10_000 }).toBe(start.length + 1)
  const added = (await wings(page, id)).at(-1)
  expect(added.kind).toBe('stair')
  await undo(page)
  expect(await wings(page, id)).toEqual(start)
})

/** Drag a handle with the real mouse, in small steps, from its centre by (dx, dy) screen pixels. */
async function drag(page: Page, testId: string, dx: number, dy: number, release: 'up' | 'escape' = 'up') {
  const box = await page.getByTestId(testId).boundingBox()
  if (!box) throw new Error(`${testId} is not on screen`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  if (release === 'escape') await page.keyboard.press('Escape')
  await page.mouse.up()
}

test('the picked part follows its edge square, grip and knob under the mouse, one undo step each, and Escape drops a drag', async ({ page }) => {
  test.setTimeout(120_000)
  await load(page, 'C')
  const id = 'C-0'
  const start = await wings(page, id)
  // a rect part has edge squares; C-0's last porch is a rect
  const mi = start.findLastIndex((w: any) => (w.shape ?? 'rect') === 'rect' && w.kind === 'porch') + 1
  expect(mi).toBeGreaterThan(0)
  await store(page, 'pickPart', { objectId: id, mass: mi })
  await page.evaluate((id) => (window as any).islandale.focus(id, 180, 30, 18), id)
  for (const h of ['part-handle-0', 'part-handle-1', 'part-handle-2', 'part-handle-3', 'part-grip', 'part-knob']) {
    await expect(page.getByTestId(h), h).toBeVisible({ timeout: 15_000 })
  }
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const w0 = start[mi - 1]
  const size = (w: any) => [w.w, w.d]

  // an edge square: the part changes size by whole inches, and undo puts it back
  await drag(page, 'part-handle-1', 60, 0)
  const resized = (await wings(page, id))[mi - 1]
  expect(size(resized)).not.toEqual(size(w0))
  // the change snaps to the inch (the scheme's own sizes need not sit on the inch)
  for (const [a, b] of size(resized).map((v: number, k: number) => [v, size(w0)[k]])) expect(Math.abs((a - b) * 12 - Math.round((a - b) * 12))).toBeLessThan(1e-3)
  await undo(page)
  expect(await wings(page, id)).toEqual(start)

  // Escape mid-drag: nothing is written
  await drag(page, 'part-handle-1', 60, 0, 'escape')
  expect(await wings(page, id)).toEqual(start)

  // the grip moves the part, the knob turns it
  await drag(page, 'part-grip', 40, 25)
  const moved = (await wings(page, id))[mi - 1]
  expect([moved.dx, moved.dz]).not.toEqual([w0.dx, w0.dz])
  await undo(page)
  await drag(page, 'part-knob', 70, 40)
  const turned = (await wings(page, id))[mi - 1]
  expect(turned.rot ?? 0).not.toBe(w0.rot ?? 0)
  expect((turned.rot ?? 0) % 5).toBe(0)
  await undo(page)
  expect(await wings(page, id)).toEqual(start)
  expect(errors).toEqual([])
})

test('the picked part HUD sits below the top bar however many rows the bar wraps to', async ({ page }) => {
  test.setTimeout(120_000)
  await load(page, 'C')
  await store(page, 'pickPart', { objectId: 'C-0', mass: 3 })
  for (const [width, height] of [[1280, 800], [1512, 982], [1920, 1080]]) {
    await page.setViewportSize({ width, height })
    const hud = page.getByTestId('part-hud')
    await expect(hud).toContainText('Deck 3')
    await expect
      .poll(async () => {
        const [h, bar] = await Promise.all([hud.boundingBox(), page.locator('header.topbar').boundingBox()])
        return h && bar ? Math.round(h.y - (bar.y + bar.height)) : null
      }, { message: `${width} x ${height}`, timeout: 15_000 })
      .toBeGreaterThanOrEqual(0)
  }
})

test('a click on the rail of a selected cabin picks the deck it rails, plain or with Alt', async ({ page }) => {
  test.setTimeout(120_000)
  await load(page, 'C')
  const id = 'C-0'
  await expect.poll(async () => (await railedEdges(page))[id]?.[3], { timeout: 30_000 }).toBeTruthy()
  await page.evaluate((id) => (window as any).islandale.focus(id, 180, 22, 9), id)
  await store(page, 'select', [id])
  const spots: { x: number; y: number }[] = await page.evaluate((id) => (window as any).islandale.railPointsOf(id, 3), id)
  expect(spots.length, 'rail points of Deck 3 on screen').toBeGreaterThan(0)
  const state = () =>
    page.evaluate(() => {
      const s = (window as any).islandale.store.getState()
      return { selection: [...s.selection], picked: s.pickedPart ? { ...s.pickedPart } : null }
    })
  for (const [k, p] of spots.slice(0, 6).entries()) {
    const alt = k % 2 === 1
    await store(page, 'select', [id])
    if (alt) await page.keyboard.down('Alt')
    await page.mouse.click(p.x, p.y)
    if (alt) await page.keyboard.up('Alt')
    await expect.poll(state, { message: `${alt ? 'Alt+' : ''}click at ${Math.round(p.x)}, ${Math.round(p.y)}` }).toEqual({ selection: [id], picked: { objectId: id, mass: 3 } })
  }
})

test('hiding a cabin with a part picked takes its chips, grip and knob away with it, by its own Hide or its layer', async ({ page }) => {
  test.setTimeout(120_000)
  await load(page, 'C')
  const id = 'C-0'
  const overlay = page.locator('[data-testid^="add-chip-"], [data-testid^="rail-chip-"], [data-testid="part-grip"], [data-testid="part-knob"]')
  await store(page, 'pickPart', { objectId: id, mass: 3 })
  await page.evaluate((id) => (window as any).islandale.focus(id, 180, 22, 10), id)
  await expect(page.getByTestId('part-grip')).toBeAttached({ timeout: 15_000 })
  await page.locator('section.inspector').getByRole('button', { name: 'Hide', exact: true }).click()
  await expect(overlay).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).islandale.store.getState().pickedPart)).toBeNull()

  await store(page, 'setHidden', id, false)
  await store(page, 'pickPart', { objectId: id, mass: 3 })
  await expect(page.getByTestId('part-grip')).toBeAttached({ timeout: 15_000 })
  await store(page, 'setLayer', 'buildings', { visible: false })
  await expect(overlay).toHaveCount(0)
  await store(page, 'setLayer', 'buildings', { visible: true })
  await expect(page.getByTestId('part-grip')).toBeAttached({ timeout: 15_000 })
})
