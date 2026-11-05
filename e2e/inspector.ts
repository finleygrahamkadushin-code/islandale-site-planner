import { expect, type Page } from '@playwright/test'

/** Open one of the inspector's collapsible headings (4B) if it is closed; only Placement and Size and shape start open. */
export async function openSection(page: Page, id: string): Promise<void> {
  const trigger = page.getByTestId(`section-${id}`)
  await expect(trigger).toBeVisible({ timeout: 15_000 })
  if ((await trigger.getAttribute('data-state')) !== 'open') await trigger.click()
  await expect(trigger).toHaveAttribute('data-state', 'open')
}
