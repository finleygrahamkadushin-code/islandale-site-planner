import { describe, expect, test } from 'vitest'
import { keepsKey, type KeyTarget } from './keyOwner'

const button: KeyTarget = { tag: 'BUTTON' }
const input = (inputType: string): KeyTarget => ({ tag: 'INPUT', inputType })

describe('keepsKey', () => {
  test('nothing focused, or the page body, keeps no key', () => {
    expect(keepsKey(null, 'ArrowRight')).toBe(false)
    expect(keepsKey({ tag: 'BODY' }, 'Delete')).toBe(false)
  })

  test('a text field keeps every key', () => {
    for (const type of ['text', 'number', 'search']) {
      expect(keepsKey(input(type), 'q')).toBe(true)
      expect(keepsKey(input(type), 'Backspace')).toBe(true)
      expect(keepsKey(input(type), 'ArrowLeft')).toBe(true)
    }
    expect(keepsKey({ tag: 'TEXTAREA' }, 'r')).toBe(true)
    expect(keepsKey({ tag: 'SELECT' }, 'ArrowDown')).toBe(true)
    expect(keepsKey({ tag: 'DIV', editable: true }, 'Delete')).toBe(true)
  })

  test('a slider keeps the keys that move it, and gives the plan the rest', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) {
      expect(keepsKey(input('range'), key), key).toBe(true)
    }
    expect(keepsKey(input('range'), 'Delete')).toBe(false)
    expect(keepsKey(input('range'), 'q')).toBe(false)
    expect(keepsKey({ tag: 'DIV', role: 'slider' }, 'ArrowRight')).toBe(true)
  })

  test('a tab, a radio or a menu item keeps the arrow keys that move between its siblings', () => {
    for (const role of ['tab', 'radio', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'option']) {
      expect(keepsKey({ tag: 'BUTTON', role }, 'ArrowRight'), role).toBe(true)
      expect(keepsKey({ tag: 'BUTTON', role }, 'Home'), role).toBe(true)
      expect(keepsKey({ tag: 'BUTTON', role }, 'v'), role).toBe(false)
    }
  })

  test('a plain button or a checkbox keeps nothing, so a nudge still works after a click on one', () => {
    expect(keepsKey(button, 'ArrowRight')).toBe(false)
    expect(keepsKey(button, 'Delete')).toBe(false)
    expect(keepsKey(input('checkbox'), 'ArrowRight')).toBe(false)
  })

  test('anything inside a dialog or menu keeps every key', () => {
    const inDialog: KeyTarget = { tag: 'BUTTON', inLayer: true }
    for (const key of ['Delete', 'Backspace', 'ArrowRight', 'q', 'z', 'Escape', '1']) {
      expect(keepsKey(inDialog, key), key).toBe(true)
    }
  })
})
