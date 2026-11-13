/**
 * The 3D view as a keyboard target (R10.1). It can take focus (and shows a
 * ring when it has it from the keyboard), so after "Select …" or "Place …"
 * in command search, or a library pick made with the keyboard, focus lands
 * where the arrows, Q / E / R, Enter, Delete and Escape act, not back in an
 * input or on the page.
 */
export const PLAN_VIEW_ID = 'plan-view'

/** Focus the 3D view; quiet when there is none (no WebGL, a test). */
export function focusPlanView(): void {
  if (typeof document === 'undefined') return
  document.getElementById(PLAN_VIEW_ID)?.focus()
}
