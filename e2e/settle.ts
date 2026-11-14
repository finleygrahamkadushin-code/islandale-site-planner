import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Waits on the app's own signals instead of fixed sleeps (R11.5). The 3D
 * view draws only when something changes (R8.1), so "it has stopped drawing"
 * is a real condition: the camera has landed, the labels and chips have been
 * placed, and every mesh's world matrix is up to date for a click.
 */

/** Animation frames in a row with no new draw before the view counts as still. */
const STILL_TICKS = 4
/** And at least this long, so a draw asked for by a timer (a label pass, a chip) is not missed. */
const STILL_MS = 300
/** Give up after this long; under software rendering a heavy scheme can draw for many seconds. */
const SETTLE_LIMIT_MS = 120_000

/** The one probe read here (src/scene/CameraRig.tsx): the renderer's counters, `frame` among them. */
type WithRenderInfo = { islandale?: { renderInfo?: () => { frame?: number } } }

/**
 * Wait until the 3D view has drawn everything it asked for: the renderer's
 * frame count (`renderInfo().frame`) stays the same for STILL_TICKS animation
 * frames and STILL_MS. Fails if it is still drawing after `limitMs`.
 */
export async function viewSettled(page: Page, { limitMs = SETTLE_LIMIT_MS } = {}): Promise<void> {
  await page.waitForFunction(() => typeof (window as unknown as WithRenderInfo).islandale?.renderInfo === 'function', null, { timeout: limitMs })
  const result = await page.evaluate(
    async ({ ticks, quietMs, limit }) => {
      const frame = () => Number((window as unknown as WithRenderInfo).islandale?.renderInfo?.().frame)
      const nextTick = () => new Promise<number>((r) => requestAnimationFrame(r))
      const start = performance.now()
      let last = frame()
      let still = 0
      let stillSince = start
      while (performance.now() - start < limit) {
        const now = await nextTick()
        const f = frame()
        if (f !== last) {
          last = f
          still = 0
          stillSince = now
        } else if (++still >= ticks && now - stillSince >= quietMs) return { settled: true, ms: Math.round(now - start) }
      }
      return { settled: false, ms: Math.round(performance.now() - start) }
    },
    { ticks: STILL_TICKS, quietMs: STILL_MS, limit: limitMs },
  )
  expect(result.settled, `the 3D view stopped drawing within ${limitMs} ms`).toBe(true)
}

/** Wait until an element's box is the same on two reads `gapMs` apart (a card the app re-places on a timer). */
export async function boxSettled(locator: Locator, { gapMs = 500, timeout = 30_000 } = {}): Promise<void> {
  const page = locator.page()
  let before = await locator.boundingBox()
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(gapMs)
        const now = await locator.boundingBox()
        const same = !!before && !!now && before.x === now.x && before.y === now.y && before.width === now.width && before.height === now.height
        before = now
        return same
      },
      { message: 'the element stopped moving', timeout, intervals: [0] },
    )
    .toBe(true)
}
