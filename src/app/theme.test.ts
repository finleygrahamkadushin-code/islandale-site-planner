/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { applyTheme, DEFAULT_THEME, initTheme, savedTheme, THEME_KEY, useTheme } from './theme'
import { fakeStorage } from '../guide/testStorage'

/** The app's stylesheet as text, comments dropped (the test environment is node, with no CSS engine). */
const CSS = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

type Tokens = Record<string, string>

/** Every innermost `selector { declarations }` block with the selector trimmed. */
function blocks(css: string): { readonly selector: string; readonly body: string }[] {
  return [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))
}

function tokensOf(body: string): Tokens {
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

/** All plain `:root` blocks merged in file order: the dark theme. */
function darkTokens(): Tokens {
  return Object.assign({}, ...blocks(CSS).filter((b) => b.selector === ':root').map((b) => tokensOf(b.body)))
}

function blockTokens(selector: string): Tokens {
  const found = blocks(CSS).filter((b) => b.selector === selector)
  expect(found, `one ${selector} block`).toHaveLength(1)
  return tokensOf(found[0].body)
}

const lightChosen = () => blockTokens(':root[data-theme="light"]')
const lightFromSystem = () => blockTokens(':root:not([data-theme="dark"])')

/** A token's colour as #rrggbb, following var() references. */
function resolve(tokens: Tokens, name: string, depth = 0): string {
  const v = tokens[name]
  expect(v, `token ${name}`).toBeDefined()
  const ref = /^var\((--[\w-]+)\)$/.exec(v)
  if (ref && depth < 8) return resolve(tokens, ref[1], depth + 1)
  expect(v, `${name} is a hex colour`).toMatch(/^#[0-9a-f]{6}$/i)
  return v
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

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
  const themes: Record<string, () => Tokens> = {
    dark: darkTokens,
    light: () => ({ ...darkTokens(), ...lightChosen() }),
  }

  for (const [name, tokens] of Object.entries(themes)) {
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
