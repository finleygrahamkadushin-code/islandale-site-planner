/**
 * Shortcut hints for this computer (R9.9): ⌘ and ⇧ run together on a Mac,
 * "Ctrl+Shift+Z" on Windows and Linux. Every hint is written once as
 * `Mod+Z`, `Shift+Mod+Z` and so on, and shown through `keys()`. The key
 * handler itself takes either ⌘ or Ctrl (`useKeyboardShortcuts`).
 */

/** The parts of `navigator` that say which system this is. */
export interface PlatformInfo {
  readonly userAgentData?: { readonly platform?: string }
  readonly platform?: string
  readonly userAgent?: string
}

const APPLE = /mac|iphone|ipad|ipod/i

/** True on macOS and iOS. userAgentData first (newer browsers), then the older fields. */
export function isMacPlatform(nav: PlatformInfo | undefined): boolean {
  if (!nav) return false
  const fromData = nav.userAgentData?.platform
  if (fromData) return APPLE.test(fromData)
  if (nav.platform) return APPLE.test(nav.platform)
  return APPLE.test(nav.userAgent ?? '')
}

const MAC_SYMBOLS: Readonly<Record<string, string>> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Mod: '⌘' }
/** The order each system writes its modifiers in: ⌃⌥⇧⌘ on a Mac, Ctrl+Alt+Shift elsewhere. */
const MAC_ORDER = ['Ctrl', 'Alt', 'Shift', 'Mod']
const OTHER_ORDER = ['Mod', 'Ctrl', 'Alt', 'Shift']

/** `Shift+Mod+Z` as this system writes it. */
export function formatKeys(spec: string, mac: boolean): string {
  const parts = spec.split('+')
  const key = parts[parts.length - 1]
  const mods = new Set(parts.slice(0, -1))
  if (mac) return MAC_ORDER.filter((m) => mods.has(m)).map((m) => MAC_SYMBOLS[m]).join('') + key
  const names = OTHER_ORDER.filter((m) => mods.has(m)).map((m) => (m === 'Mod' ? 'Ctrl' : m))
  return [...new Set(names), key].join('+')
}

/** This computer is a Mac (or an iPad): ⌘ is its Mod key. */
export const ON_MAC = typeof navigator !== 'undefined' && isMacPlatform(navigator as PlatformInfo)

/** A shortcut hint for this computer. */
export const keys = (spec: string): string => formatKeys(spec, ON_MAC)
