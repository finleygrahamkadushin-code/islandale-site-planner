/**
 * Which key presses belong to the control that has focus rather than to the
 * plan. The rule works on plain data (`KeyTarget`), so it is tested without a
 * DOM; `keyTargetOf` reads that data off the element a key was pressed on.
 */

/** What the shortcut handler needs to know about the element a key was pressed on. */
export interface KeyTarget {
  /** Upper-case tag name, as `Element.tagName` gives it. */
  readonly tag: string
  /** The `type` of an INPUT. */
  readonly inputType?: string
  readonly editable?: boolean
  readonly role?: string | null
  /** Inside a dialog or menu that does not edit the plan. */
  readonly inLayer?: boolean
}

/** A layer with `data-plan-keys` edits the plan (the interior editor, the tour card), so undo and the other plan keys still work inside it. */
const PLAN_KEYS_ATTR = 'data-plan-keys'

const LAYER_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"]'
const TEXT_INPUT_TYPES = new Set(['text', 'number', 'search', 'email', 'url', 'password', 'tel'])
const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])
/** Roles whose arrow keys move between siblings (or, for a slider, change the value). */
const MOVE_KEY_ROLES = new Set(['tab', 'radio', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'option', 'slider'])

/** True when the focused control keeps this key, so the plan must not act on it. */
export function keepsKey(target: KeyTarget | null, key: string): boolean {
  if (!target) return false
  if (target.inLayer) return true
  if (target.editable || target.tag === 'TEXTAREA' || target.tag === 'SELECT') return true
  if (target.tag === 'INPUT' && TEXT_INPUT_TYPES.has(target.inputType ?? 'text')) return true
  if (!MOVE_KEYS.has(key)) return false
  return (target.tag === 'INPUT' && target.inputType === 'range') || MOVE_KEY_ROLES.has(target.role ?? '')
}

/** Read a key event's target as plain data; null when it is not an element. */
export function keyTargetOf(target: EventTarget | null): KeyTarget | null {
  if (!(target instanceof HTMLElement)) return null
  const layer = target.closest(LAYER_SELECTOR)
  return {
    tag: target.tagName,
    inputType: target instanceof HTMLInputElement ? target.type : undefined,
    editable: target.isContentEditable,
    role: target.getAttribute('role'),
    // a target already gone from the page belongs to a layer that closed on this very key (the Help sheet's
    // content unmounts while Radix handles its Escape), so the plan leaves the key alone
    inLayer: !target.isConnected || (!!layer && !layer.hasAttribute(PLAN_KEYS_ATTR)),
  }
}
