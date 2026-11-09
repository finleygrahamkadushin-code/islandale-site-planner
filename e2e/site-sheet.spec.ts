import { expect, test, type Page } from '@playwright/test'
import { clearSaves } from './fresh'

/**
 * 6H done-when: Scheme C's site plan prints at 1" = 20'-0" on Tabloid, true
 * scale, on one page with its notes beside it, and every 5E number on it
 * (lot coverage, program budget, code check, clearances) reads exactly as
 * the app's own panels and inspector read it.
 */

const PX_PER_IN = 96
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Drawing sheets' })
const notes = (page: Page) => dialog(page).getByTestId('site-notes')
const squeeze = (s: string) => s.replace(/\s+/g, ' ').trim()

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearSaves(page)
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 20_000 })
  await page.waitForFunction(() => (window as any).islandale?.store, null, { timeout: 60_000 })
  await page.evaluate(() => {
    const s = (window as any).islandale.store.getState()
    s.loadScheme('C')
    s.select([])
  })
})

async function openSheets(page: Page) {
  await page.getByRole('button', { name: 'Sheets', exact: true }).click()
  // the sheets load on first use; the dev server compiles them on demand
  await expect(dialog(page)).toBeVisible({ timeout: 30_000 })
  await expect(dialog(page).getByTestId('site-plan-svg')).toBeVisible({ timeout: 30_000 })
  // the building sheets aren't what this checks: off, so the elevations don't hold Print back
  for (const name of ['Plan', 'Elevations', 'Measurements']) await dialog(page).getByRole('checkbox', { name, exact: true }).uncheck()
}

test('the site notes read word for word as the Lot facts, Program and Code check panels', async ({ page }) => {
  test.setTimeout(180_000)
  await page.getByTestId('tab-site').click()
  const lot = squeeze(await page.getByTestId('lot-facts').innerText())
  const coverage = lot.match(/Building footprint (.+? %)/)![1]
  const rows = await page
    .getByTestId('code-check')
    .locator('li[data-row]')
    .evaluateAll((lis) =>
      lis.map((li) => {
        // the row as the eye reads it: "label · text", without the screen-reader verdict or the name buttons after it
        const seen = li.cloneNode(true) as HTMLElement
        seen.querySelectorAll('.sr-only, button').forEach((el) => el.remove())
        return { id: li.getAttribute('data-row')!, verdict: li.getAttribute('data-verdict')!, words: seen.textContent ?? '' }
      }),
    )
  expect(rows.length).toBeGreaterThan(5)
  await page.getByTestId('tab-build').click()
  const program = await page.getByTestId('program-budget').locator('dd').allInnerTexts()
  expect(program.length).toBeGreaterThan(2)

  await openSheets(page)
  const sheet = squeeze(await notes(page).innerText())
  expect(sheet).toContain(`Lot coverage ${coverage}`)
  for (const v of program) expect(sheet).toContain(squeeze(v))
  for (const r of rows) {
    const row = notes(page).locator(`[data-notes="code"] tr[data-row="${r.id}"]`)
    await expect(row).toHaveAttribute('data-verdict', r.verdict)
    expect(squeeze(await row.innerText())).toContain(squeeze(r.words))
  }
})

test('each building’s clearances on the sheet are its inspector rows', async ({ page }) => {
  test.setTimeout(180_000)
  await page.getByTestId('tab-site').click()
  const ids = await page.evaluate(() => {
    const p = (window as any).islandale.store.getState().plan
    return p.order.filter((id: string) => p.objects[id].type === 'house')
  })
  const want: string[] = []
  for (const id of ids) {
    await page.evaluate((id) => (window as any).islandale.store.getState().select([id]), id)
    await expect(page.getByTestId('clearance-row').first()).toBeVisible()
    want.push((await page.getByTestId('clearance-row').locator('dd').allInnerTexts()).join('; '))
  }
  await page.evaluate(() => (window as any).islandale.store.getState().select([]))
  await openSheets(page)
  const got = await notes(page).locator('[data-notes="clearances"] td').allInnerTexts()
  expect(got.map((t) => t.replace(/\s*⚠$/, ''))).toEqual(want)
})

test('the site plan is drawn at 1" = 20\'-0" on one Tabloid page, turned to fit, with its notes beside it', async ({ page }) => {
  test.setTimeout(180_000)
  await openSheets(page)
  const svg = dialog(page).getByTestId('site-plan-svg')
  const { widthIn, viewBoxW, cssW } = await svg.evaluate((el) => ({
    widthIn: parseFloat(el.getAttribute('width') ?? ''),
    viewBoxW: parseFloat((el.getAttribute('viewBox') ?? '').split(' ')[2]),
    cssW: el.getBoundingClientRect().width,
  }))
  // feet of drawing × 1/20 in per foot is the printed width, and the browser lays it out at that many inches
  expect(widthIn).toBeCloseTo(viewBoxW * 0.05, 3)
  expect(cssW / PX_PER_IN).toBeCloseTo(widthIn, 1)
  await expect(dialog(page).getByTestId('site-fit')).toContainText('1 page on Tabloid 17 × 11 in, the notes beside the drawing')
  await expect(dialog(page).getByTestId('site-sheet').locator('.sheet-page')).toHaveCount(1)
  await expect(dialog(page).getByTestId('site-sheet')).toContainText('Scale 1" = 20\'-0"')
  await expect(dialog(page).getByRole('button', { name: 'Print', exact: true })).toBeEnabled()
})

test('North up turns the arrow straight up and tiles the plan; 1/16" puts the notes on a page of their own', async ({ page }) => {
  test.setTimeout(180_000)
  await openSheets(page)
  const arrow = () => dialog(page).getByTestId('site-sheet').locator('.sheet-north g').first()
  expect(await arrow().getAttribute('transform')).not.toMatch(/^rotate\(-?0\)$/)
  await dialog(page).getByRole('checkbox', { name: 'North up', exact: true }).check()
  await expect(dialog(page).getByTestId('site-fit')).toContainText('3 pages on Tabloid')
  await expect(dialog(page).getByTestId('site-fit')).toContainText('one page of Arch C')
  await expect(dialog(page).getByTestId('site-sheet').locator('.sheet-page')).toHaveCount(3)
  expect(await arrow().getAttribute('transform')).toMatch(/^rotate\(-?0\)$/)

  await dialog(page).getByRole('checkbox', { name: 'North up', exact: true }).uncheck()
  await dialog(page).getByRole('combobox', { name: 'Site plan scale' }).selectOption('0.0625')
  await expect(dialog(page).getByTestId('site-fit')).toContainText('2 pages on Tabloid')
  await expect(dialog(page).getByTestId('site-sheet').locator('.sheet-page')).toHaveCount(2)
})

test('the site plan can be turned off and on again', async ({ page }) => {
  test.setTimeout(180_000)
  await openSheets(page)
  await dialog(page).getByRole('checkbox', { name: 'Site plan', exact: true }).uncheck()
  await expect(dialog(page).getByTestId('site-sheet')).toHaveCount(0)
  await dialog(page).getByRole('checkbox', { name: 'Site plan', exact: true }).check()
  await expect(dialog(page).getByTestId('site-plan-svg')).toBeVisible()
})
