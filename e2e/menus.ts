import { expect, type Locator, type Page } from '@playwright/test'

/**
 * The top bar's File and View menus (R9.1). What used to be a button in the
 * bar is now a row in one of them, under the same test id.
 */
export type TopMenu = 'file' | 'view'

const NAMES: Readonly<Record<TopMenu, string>> = { file: 'File', view: 'View' }

/** The menu's button in the top bar. */
export const menuButton = (page: Page, menu: TopMenu): Locator => page.getByTestId(`menu-${menu}`)

/** Open the menu unless it is open already; returns the open menu. */
export async function openMenu(page: Page, menu: TopMenu): Promise<Locator> {
  const button = menuButton(page, menu)
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
  const content = page.getByRole('menu', { name: NAMES[menu] })
  await expect(content).toBeVisible()
  return content
}

/** Open the menu and pick the row with this test id. File rows close the menu. */
export async function pickFromMenu(page: Page, menu: TopMenu, testId: string): Promise<void> {
  await openMenu(page, menu)
  await page.getByTestId(testId).click()
}

/** Pick a View row (a style, an effect, a label mode or a theme) and close the menu, which stays open after a pick. */
export async function pickView(page: Page, testId: string): Promise<void> {
  await pickFromMenu(page, 'view', testId)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
}

/** The test id of a display style's row in the View menu, from its name. */
export const STYLE_IDS: Readonly<Record<string, string>> = {
  Realistic: 'style-realistic',
  'White model': 'style-white',
  Sketch: 'style-sketch',
  Diagram: 'style-diagram',
}
