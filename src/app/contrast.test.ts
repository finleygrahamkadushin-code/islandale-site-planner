import { describe, expect, test } from 'vitest'
import { colourOf, contrast, declarationsOf, resolve, THEMES } from './cssTestKit'

/**
 * R10.3: contrast outside the theme's token pairs (those are in theme.test.ts).
 * Text reaches 4.5:1 and control borders and icons 3:1 (WCAG 1.4.3, 1.4.11), in
 * both themes. The ratios are computed from the stylesheet itself.
 */

const TEXT = 4.5
const NON_TEXT = 3

/** Rules that put text on a filled background of their own. */
const FILLED_TEXT = ['.ph-grip', '.isolate-done', '.measure-label', '.connect-chip.on', '.aa-chip.on', '.rail-chip.bad']

describe('contrast (R10.3)', () => {
  for (const [name, tokens] of Object.entries(THEMES)) {
    test.each(FILLED_TEXT)(`${name}: %s text on its fill passes 4.5:1`, (selector) => {
      const t = tokens()
      const d = declarationsOf(selector)
      const fill = d['background'] ?? d['background-color']
      expect(contrast(colourOf(t, d['color']), colourOf(t, fill))).toBeGreaterThanOrEqual(TEXT)
    })

    test.each(['--panel', '--bg'])(`${name}: the control border passes 3:1 on %s`, (bg) => {
      const t = tokens()
      expect(contrast(resolve(t, '--control-line'), resolve(t, bg))).toBeGreaterThanOrEqual(NON_TEXT)
    })

    test(`${name}: a hidden layer's eye button passes 3:1 on the panel, with no fade`, () => {
      const t = tokens()
      const d = declarationsOf('button.icon.off')
      expect(d['opacity']).toBeUndefined()
      expect(contrast(colourOf(t, d['color']), resolve(t, '--panel'))).toBeGreaterThanOrEqual(NON_TEXT)
    })
  }

  test.each(['button', 'input'])('%s draws its border in the control colour', (selector) => {
    expect(declarationsOf(selector)['border']).toContain('var(--control-line)')
  })

  test('field error text is at least 12 px', () => {
    for (const selector of ['.ft-in .err', '.field.num .err']) {
      const size = /^(\d+(?:\.\d+)?)px$/.exec(declarationsOf(selector)['font-size'])
      expect(size, selector).not.toBeNull()
      expect(Number(size?.[1])).toBeGreaterThanOrEqual(12)
    }
  })
})
