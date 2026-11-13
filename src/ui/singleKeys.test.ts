import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fakeStorage } from '../guide/testStorage'
import { isSingleCharacterKey, savedSingleKeys, SINGLE_KEYS_KEY, singleKeyOff, useSingleKeys } from './singleKeys'

/** R10.5 (WCAG 2.1.4): single-character shortcuts can be turned off, remembered per browser. */
const key = (k: string, mods: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

describe('single-key shortcuts (R10.5)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage())
    useSingleKeys.setState({ on: true })
  })
  afterEach(() => vi.unstubAllGlobals())

  test('letters, digits and punctuation with no Ctrl, Cmd or Alt are single-character keys, with or without Shift', () => {
    for (const k of ['m', 'R', '1', '?', '[']) expect(isSingleCharacterKey(key(k)), k).toBe(true)
    expect(isSingleCharacterKey(key('R', { shiftKey: true }))).toBe(true)
  })

  test('named keys, chords and the space bar are not', () => {
    for (const k of ['ArrowLeft', 'Escape', 'Delete', 'Backspace', 'Enter', 'Tab', ' ']) expect(isSingleCharacterKey(key(k)), k).toBe(false)
    expect(isSingleCharacterKey(key('z', { metaKey: true }))).toBe(false)
    expect(isSingleCharacterKey(key('k', { ctrlKey: true }))).toBe(false)
    expect(isSingleCharacterKey(key('e', { altKey: true }))).toBe(false)
  })

  test('on by default; turned off, only single-character keys are held back', () => {
    expect(savedSingleKeys()).toBe(true)
    expect(singleKeyOff(key('m'))).toBe(false)
    useSingleKeys.getState().setOn(false)
    expect(singleKeyOff(key('m'))).toBe(true)
    expect(singleKeyOff(key('ArrowUp'))).toBe(false)
    expect(singleKeyOff(key('z', { metaKey: true }))).toBe(false)
  })

  test('the choice is remembered per browser', () => {
    useSingleKeys.getState().setOn(false)
    expect(localStorage.getItem(SINGLE_KEYS_KEY)).toBe('off')
    expect(savedSingleKeys()).toBe(false)
    useSingleKeys.getState().setOn(true)
    expect(savedSingleKeys()).toBe(true)
  })
})
