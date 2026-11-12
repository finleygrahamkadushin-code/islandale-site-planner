import { describe, expect, it } from 'vitest'
import { CHECK_PANELS, checkPanelShown, warningChipsShown } from './hides'

describe('checkPanelShown', () => {
  it('hides the code check, the program budget and the accessible-route (ADA) panel in Beginner', () => {
    for (const panel of CHECK_PANELS) expect(checkPanelShown(panel, 'beginner'), panel).toBe(false)
  })

  it('shows every one of them in Advanced', () => {
    for (const panel of CHECK_PANELS) expect(checkPanelShown(panel, 'advanced'), panel).toBe(true)
  })

  it('names exactly the three check panels', () => {
    expect([...CHECK_PANELS].sort()).toEqual(['code-check', 'program-budget', 'route'])
  })
})

describe('warningChipsShown', () => {
  it('shows the route and step chips in Advanced on the Site, Build and Interior tabs', () => {
    for (const tab of ['site', 'build', 'interior'] as const) expect(warningChipsShown({ mode: 'advanced', tab, presenting: false }), tab).toBe(true)
  })

  it('hides them in Beginner on every tab', () => {
    for (const tab of ['site', 'build', 'interior', 'present'] as const) expect(warningChipsShown({ mode: 'beginner', tab, presenting: false }), tab).toBe(false)
  })

  it('hides them on the Present tab and while presenting, whatever the mode', () => {
    expect(warningChipsShown({ mode: 'advanced', tab: 'present', presenting: false })).toBe(false)
    expect(warningChipsShown({ mode: 'advanced', tab: 'build', presenting: true })).toBe(false)
  })
})
