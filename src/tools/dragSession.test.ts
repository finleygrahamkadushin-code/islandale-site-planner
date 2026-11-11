import { describe, expect, test, vi } from 'vitest'
import { startDragSession } from './dragSession'

/** Node has EventTarget but no PointerEvent or KeyboardEvent: a plain event with the fields the session reads. */
const ev = (type: string, fields: Record<string, unknown> = {}): Event => Object.assign(new Event(type, { cancelable: true }), fields)
const pointer = (type: string, pointerId = 1) => ev(type, { pointerId })
const key = (k: string) => ev('keydown', { key: k })

function setup(extra: { holdKeys?: boolean; withUp?: boolean } = {}) {
  const win = new EventTarget()
  const onCancel = vi.fn()
  const onMove = vi.fn()
  const onUp = vi.fn()
  const session = startDragSession(win, {
    pointerId: 1,
    holdKeys: extra.holdKeys,
    onCancel,
    ...(extra.withUp ? { onMove, onUp } : {}),
  })
  // a listener added after the session, like the app's own shortcuts (window, bubble phase)
  const later = vi.fn()
  win.addEventListener('keydown', later)
  return { win, session, onCancel, onMove, onUp, later }
}

describe('a live drag ends cleanly however it stops', () => {
  test('pointercancel drops the drag once', () => {
    const { win, onCancel } = setup()
    win.dispatchEvent(pointer('pointercancel'))
    win.dispatchEvent(pointer('pointercancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  test('losing pointer capture drops the drag', () => {
    const { win, onCancel } = setup()
    win.dispatchEvent(pointer('lostpointercapture'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  test('another pointer cancelling leaves this drag alone', () => {
    const { win, onCancel } = setup()
    win.dispatchEvent(pointer('pointercancel', 7))
    win.dispatchEvent(pointer('lostpointercapture', 7))
    expect(onCancel).not.toHaveBeenCalled()
  })

  test('the window losing focus drops the drag', () => {
    const { win, onCancel } = setup()
    win.dispatchEvent(ev('blur'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  test('Escape drops the drag and goes no further', () => {
    const { win, onCancel, later } = setup()
    const esc = key('Escape')
    win.dispatchEvent(esc)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(esc.defaultPrevented).toBe(true)
    expect(later).not.toHaveBeenCalled()
  })

  test('holding keys swallows every key while live, and none after', () => {
    const { win, session, later } = setup({ holdKeys: true })
    win.dispatchEvent(key('Delete'))
    expect(later).not.toHaveBeenCalled()
    session.stop()
    win.dispatchEvent(key('Delete'))
    expect(later).toHaveBeenCalledTimes(1)
  })

  test('without holding keys, other keys pass through', () => {
    const { win, later, onCancel } = setup()
    win.dispatchEvent(key('Delete'))
    expect(later).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  test('stop (a normal release or an unmount) removes every listener without cancelling', () => {
    const { win, session, onCancel, later } = setup({ holdKeys: true })
    session.stop()
    win.dispatchEvent(pointer('pointercancel'))
    win.dispatchEvent(pointer('lostpointercapture'))
    win.dispatchEvent(ev('blur'))
    win.dispatchEvent(key('Escape'))
    expect(onCancel).not.toHaveBeenCalled()
    expect(later).toHaveBeenCalledTimes(1)
    expect(session.live()).toBe(false)
  })

  test('cancel from outside (unmount, Present mode) calls back once and then nothing fires', () => {
    const { win, session, onCancel } = setup()
    session.cancel()
    session.cancel()
    win.dispatchEvent(pointer('pointercancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  test('followed moves and the release end the session; capture lost after release is not a cancel', () => {
    const { win, onMove, onUp, onCancel } = setup({ withUp: true })
    win.dispatchEvent(pointer('pointermove'))
    win.dispatchEvent(pointer('pointermove', 7))
    win.dispatchEvent(pointer('pointerup'))
    win.dispatchEvent(pointer('lostpointercapture'))
    win.dispatchEvent(pointer('pointermove'))
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onUp).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })
})
