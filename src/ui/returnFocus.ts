/**
 * Focus for dialogs opened from code, not from a Radix trigger (the Designs
 * archive, the confirm dialog, the old planner's overlay): note what had
 * focus when it opened, and hand focus back there when it closes (R10.6,
 * R10.7). Without this Radix has no trigger to return to and focus falls to
 * the page.
 */

/** The element that has focus now, or null (the page itself, or no DOM). */
export function focusedElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const el = document.activeElement
  return el instanceof HTMLElement && el !== document.body ? el : null
}

/**
 * A Radix `onCloseAutoFocus` that focuses `opener()` if it is still on the
 * page (a deleted object's button is not); otherwise Radix does as it would.
 */
export function returnFocusTo(opener: () => HTMLElement | null): (e: Event) => void {
  return (e) => {
    const to = opener()
    if (!to?.isConnected) return
    e.preventDefault()
    to.focus()
  }
}
