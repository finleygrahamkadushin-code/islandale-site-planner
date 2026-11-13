/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'

/**
 * Reading the app's stylesheet in a unit test (the test environment is node,
 * with no CSS engine): its blocks, the theme tokens and WCAG contrast. Used by
 * theme.test.ts (4E) and contrast.test.ts (R10.3). Test code only.
 */

/** The app's stylesheet as text, comments dropped. */
export const CSS = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

export type Tokens = Record<string, string>

/** Every innermost `selector { declarations }` block with the selector trimmed. */
export function blocks(css: string): { readonly selector: string; readonly body: string }[] {
  return [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))
}

export function tokensOf(body: string): Tokens {
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

/** All plain `:root` blocks merged in file order: the dark theme. */
export function darkTokens(): Tokens {
  return Object.assign({}, ...blocks(CSS).filter((b) => b.selector === ':root').map((b) => tokensOf(b.body)))
}

export function blockTokens(selector: string): Tokens {
  const found = blocks(CSS).filter((b) => b.selector === selector)
  expect(found, `one ${selector} block`).toHaveLength(1)
  return tokensOf(found[0].body)
}

export const lightChosen = (): Tokens => blockTokens(':root[data-theme="light"]')
export const lightFromSystem = (): Tokens => blockTokens(':root:not([data-theme="dark"])')

/** Both themes' tokens: dark, and light laid over it. */
export const THEMES: Readonly<Record<'dark' | 'light', () => Tokens>> = {
  dark: darkTokens,
  light: () => ({ ...darkTokens(), ...lightChosen() }),
}

/** A colour value (`#rrggbb`, `#rgb` or `var(--token)`) as #rrggbb, following var() references. */
export function colourOf(tokens: Tokens, value: string, depth = 0): string {
  const ref = /^var\((--[\w-]+)\)$/.exec(value.trim())
  if (ref && depth < 8) {
    expect(tokens[ref[1]], `token ${ref[1]}`).toBeDefined()
    return colourOf(tokens, tokens[ref[1]], depth + 1)
  }
  const hex = value.trim().toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(hex)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  expect(hex, `${value} is a hex colour`).toMatch(/^#[0-9a-f]{6}$/)
  return hex
}

/** A token's colour as #rrggbb. */
export function resolve(tokens: Tokens, name: string): string {
  expect(tokens[name], `token ${name}`).toBeDefined()
  return colourOf(tokens, tokens[name])
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** One rule's declarations, merged from every block whose selector list names it exactly (later blocks win). */
export function declarationsOf(selector: string): Record<string, string> {
  const found = blocks(CSS).filter((b) => b.selector.split(',').map((s) => s.trim()).includes(selector))
  expect(found.length, `a rule for ${selector}`).toBeGreaterThan(0)
  const out: Record<string, string> = {}
  for (const b of found) for (const m of b.body.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)) out[m[1]] = m[2].trim()
  return out
}
