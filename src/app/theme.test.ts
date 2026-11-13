import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { applyTheme, DEFAULT_THEME, initTheme, savedTheme, THEME_KEY, useTheme } from './theme'
import { fakeStorage } from '../guide/testStorage'
import { blocks, contrast, CSS, darkTokens, lightChosen, lightFromSystem, resolve, THEMES } from './cssTestKit'

/** Text on a background: every pair the panels, bars and dialogs draw. */
const PAIRS: readonly (readonly [string, string])[] = [
  ['--fg', '--bg'],
  ['--fg', '--panel'],
  ['--muted', '--panel'],
  ['--muted', '--bg'],
  ['--primary-fg', '--primary-bg'],
  ['--danger', '--panel'],
  ['--ok', '--panel'],
  ['--warn', '--panel'],
]
const AA = 4.5

describe('theme tokens (4E)', () => {
  for (const [name, tokens] of Object.entries(THEMES)) {
    test.each(PAIRS)(`${name}: %s on %s passes 4.5:1`, (fg, bg) => {
      const t = tokens()
      expect(contrast(resolve(t, fg), resolve(t, bg))).toBeGreaterThanOrEqual(AA)
    })
  }

  test('the light theme sets every colour token the dark one does, except those built from others', () => {
    const dark = darkTokens()
    const light = lightChosen()
    const own = Object.keys(dark).filter((k) => /^#/.test(dark[k]))
    for (const k of own) expect(light[k], k).toBeDefined()
  })

  test('the system-light block and the chosen-light block are the same', () => {
    expect(lightFromSystem()).toEqual(lightChosen())
    expect(CSS).toMatch(/@media \(prefers-color-scheme: light\)\s*\{\s*:root:not\(\[data-theme="dark"\]\)/)
  })

  test('each theme names its colour scheme for the browser controls', () => {
    const scheme = (selector: string) => blocks(CSS).find((b) => b.selector === selector)?.body.match(/color-scheme:\s*(\w+)/)?.[1]
    expect(scheme(':root')).toBe('dark')
    expect(scheme(':root[data-theme="light"]')).toBe('light')
    expect(scheme(':root:not([data-theme="dark"])')).toBe('light')
  })
})

/** Just enough of <html> for applyTheme. */
function fakeRoot() {
  const attrs = new Map<string, string>()
  return {
    attrs,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  }
}

describe('theme choice (4E)', () => {
  let root: ReturnType<typeof fakeRoot>
  beforeEach(() => {
    root = fakeRoot()
    vi.stubGlobal('localStorage', fakeStorage())
    vi.stubGlobal('document', { documentElement: root })
    useTheme.setState({ theme: DEFAULT_THEME })
  })
  afterEach(() => vi.unstubAllGlobals())

  test('System is the default for a browser that has never chosen', () => {
    expect(DEFAULT_THEME).toBe('system')
    expect(savedTheme()).toBe('system')
    expect(initTheme()).toBe('system')
    expect(root.attrs.has('data-theme')).toBe(false)
  })

  test('a choice is remembered and marks <html>', () => {
    useTheme.getState().setTheme('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(root.attrs.get('data-theme')).toBe('light')
    expect(useTheme.getState().theme).toBe('light')
    useTheme.getState().setTheme('dark')
    expect(savedTheme()).toBe('dark')
    expect(root.attrs.get('data-theme')).toBe('dark')
  })

  test('System removes the mark, so the browser setting decides again', () => {
    useTheme.getState().setTheme('light')
    useTheme.getState().setTheme('system')
    expect(root.attrs.has('data-theme')).toBe(false)
    expect(savedTheme()).toBe('system')
  })

  test('a remembered choice is applied on load', () => {
    localStorage.setItem(THEME_KEY, 'light')
    expect(initTheme()).toBe('light')
    expect(root.attrs.get('data-theme')).toBe('light')
  })

  test('a stored value that is not a theme falls back to System', () => {
    localStorage.setItem(THEME_KEY, 'sepia')
    expect(savedTheme()).toBe('system')
  })

  test('no document (a worker or a test) is quiet', () => {
    vi.stubGlobal('document', undefined)
    expect(() => applyTheme('light')).not.toThrow()
  })

  test('blocked storage still switches the theme for this visit', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    useTheme.getState().setTheme('dark')
    expect(root.attrs.get('data-theme')).toBe('dark')
    expect(savedTheme()).toBe('system')
  })
})
