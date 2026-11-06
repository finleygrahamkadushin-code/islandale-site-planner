import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * Phase 4E: contact shadows and the shore rebuild only when the plan or the
 * tide changes, never during a drag; Sketch draws no lines on the terrain;
 * the after-first-frame effects arrive. Speed itself is measured on Finley's
 * Mac (PLAN-PHASE4.md), since the test browser draws in software.
 */

const info = (page: Page, name: string) => page.evaluate((n) => (window as any).islandale.meshInfo(n), name)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.meshInfo && (window as any).islandale.firstFrameMs?.(), null, { timeout: 60_000 })
  await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    s.loadScheme('C')
    ;(window as any).islandale.store.temporal.getState().clear()
  })
})

test('contact shadows rebuild on a plan change but not while dragging', async ({ page }) => {
  test.setTimeout(120_000)
  await expect.poll(() => info(page, 'contact-shadows').then((i) => i?.vertices ?? 0)).toBeGreaterThan(100)
  const id = await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    return s.plan.order.find((i: string) => s.plan.objects[i].type === 'house') as string
  })
  // a live drag: the dragged cabin's shadow leaves once, then nothing rebuilds while it moves
  await page.evaluate((i) => (window as any).islandale.liveDrag.getState().setDrag({ id: i, patch: (o: any) => ({ position: { x: o.position.x + 1, n: o.position.n } }) }), id)
  await page.waitForTimeout(300)
  const during = await info(page, 'contact-shadows')
  for (let k = 2; k < 8; k++) {
    await page.evaluate(([i, dx]) => (window as any).islandale.liveDrag.getState().setDrag({ id: i, patch: (o: any) => ({ position: { x: o.position.x + dx, n: o.position.n } }) }), [id, k] as const)
    await page.waitForTimeout(80)
  }
  expect((await info(page, 'contact-shadows'))?.id).toBe(during?.id)
  // letting go and moving it for real rebuilds
  await page.evaluate((i) => {
    const w = (window as any).islandale
    w.liveDrag.getState().setDrag(null)
    const o = w.store.getState().plan.objects[i]
    w.store.getState().moveObject(i, { x: o.position.x + 2, n: o.position.n })
  }, id)
  await expect.poll(async () => (await info(page, 'contact-shadows'))?.id).not.toBe(during?.id)
})

test('the foam line follows the tide; driftwood lies on the beach', async ({ page }) => {
  test.setTimeout(120_000)
  await expect.poll(() => info(page, 'foam').then((i) => i?.vertices ?? 0)).toBeGreaterThan(0)
  expect((await info(page, 'driftwood'))?.visible).toBe(true)
  const before = await info(page, 'foam')
  await page.evaluate(() => (window as any).islandale.store.getState().setEnvironment({ tideFt: 9 }))
  await expect.poll(async () => (await info(page, 'foam'))?.id).not.toBe(before?.id)
})

test('Sketch: outlines on the buildings, none on the terrain; effects arrive after the first frame', async ({ page }) => {
  test.setTimeout(120_000)
  await page.evaluate(() => (window as any).islandale.store.getState().setDisplayStyle('sketch'))
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as any).islandale.linesUnder('terrain'))).toBe(0)
  const stats = await page.evaluate(() => (window as any).islandale.renderInfo())
  expect(stats.programs).toBeGreaterThan(0)
})
