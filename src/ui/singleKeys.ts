import { create } from 'zustand'
import { readSaved, writeSaved } from '../guide/storage'

/**
 * Single-key shortcuts on or off (R10.5, WCAG 2.1.4). A speech-input user
 * saying a word, or anyone who brushes a key, would otherwise switch tools,
 * styles or the selection by accident. Off holds back every shortcut that is
 * one printable character with no Ctrl, Cmd or Alt (V, M, 1–4, Q / E / R, ?);
 * arrows, Escape, Delete, Enter and the Ctrl / Cmd chords keep working.
 * View state, remembered per browser: never saved with the plan, never an
 * undo step. Switched in the Help sheet and command search.
 */

export const SINGLE_KEYS_KEY = 'islandale-single-keys'

/** On unless this browser turned them off. */
export function savedSingleKeys(): boolean {
  return readSaved(SINGLE_KEYS_KEY) !== 'off'
}

export const useSingleKeys = create<{ readonly on: boolean; readonly setOn: (on: boolean) => void }>((set) => ({
  on: savedSingleKeys(),
  setOn: (on) => {
    writeSaved(SINGLE_KEYS_KEY, on ? 'on' : 'off')
    set({ on })
  },
}))

type KeyPress = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>

/** One printable character (a letter, digit, punctuation or symbol; Shift allowed) with no Ctrl, Cmd or Alt. The space bar is not one. */
export function isSingleCharacterKey(e: KeyPress): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey && [...e.key].length === 1 && e.key.trim() !== ''
}

/** True when this key is a single-character shortcut and those are turned off. */
export function singleKeyOff(e: KeyPress): boolean {
  return !useSingleKeys.getState().on && isSingleCharacterKey(e)
}
