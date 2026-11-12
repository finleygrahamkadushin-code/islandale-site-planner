import { describe, expect, it } from 'vitest'
import { formatKeys, isMacPlatform } from './keyHint'

describe('isMacPlatform', () => {
  it('reads the platform from userAgentData first, then navigator.platform, then the user agent', () => {
    expect(isMacPlatform({ userAgentData: { platform: 'macOS' } })).toBe(true)
    expect(isMacPlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(false)
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true)
    expect(isMacPlatform({ platform: 'iPhone' })).toBe(true)
    expect(isMacPlatform({ platform: 'Win32' })).toBe(false)
    expect(isMacPlatform({ platform: 'Linux x86_64' })).toBe(false)
    expect(isMacPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe(true)
    expect(isMacPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe(false)
  })

  it('is false with nothing to go on', () => {
    expect(isMacPlatform(undefined)).toBe(false)
    expect(isMacPlatform({})).toBe(false)
  })
})

describe('formatKeys', () => {
  it('shows ⌘ and ⇧ run together on a Mac', () => {
    expect(formatKeys('Mod+Z', true)).toBe('⌘Z')
    expect(formatKeys('Shift+Mod+Z', true)).toBe('⇧⌘Z')
    expect(formatKeys('Mod+Shift+G', true)).toBe('⇧⌘G')
    expect(formatKeys('Alt+Mod+K', true)).toBe('⌥⌘K')
  })

  it('spells Ctrl, Shift and Alt with plus signs elsewhere, Ctrl first', () => {
    expect(formatKeys('Mod+Z', false)).toBe('Ctrl+Z')
    expect(formatKeys('Shift+Mod+Z', false)).toBe('Ctrl+Shift+Z')
    expect(formatKeys('Mod+Shift+G', false)).toBe('Ctrl+Shift+G')
    expect(formatKeys('Alt+Mod+K', false)).toBe('Ctrl+Alt+K')
  })

  it('leaves keys without a modifier alone', () => {
    expect(formatKeys('?', true)).toBe('?')
    expect(formatKeys('1', false)).toBe('1')
    expect(formatKeys('Shift+R', false)).toBe('Shift+R')
    expect(formatKeys('Shift+R', true)).toBe('⇧R')
  })
})
