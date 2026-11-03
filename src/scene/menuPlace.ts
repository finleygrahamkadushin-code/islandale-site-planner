/**
 * Where a chip's pop-up menu goes on screen (legacy ext:attach-add
 * placePop): beside the chip on the right, flipped to its left when it
 * would cross the right edge of the open view, and its top kept inside
 * it. All in client pixels.
 */

/** The menu starts this far right of the chip's centre (or ends this far left of it). */
const BESIDE_PX = 16
/** The menu keeps this far inside the open view. */
const MARGIN_PX = 6

export interface Box {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** The menu's top-left corner for a chip centred at (x, y), a menu w × h, and the open part of the view. */
export function placeMenu(x: number, y: number, w: number, h: number, area: Box): { readonly left: number; readonly top: number } {
  let left = x + BESIDE_PX
  if (left + w > area.right - MARGIN_PX) left = x - BESIDE_PX - w
  left = Math.max(area.left + MARGIN_PX, left)
  const top = Math.max(area.top + MARGIN_PX, Math.min(area.bottom - h - MARGIN_PX, y - h / 2))
  return { left, top }
}

/** The part of the view no panel covers: the scene's viewport less the side panel on its right and the top bar over it. */
export function openArea(el: Element): Box {
  const view = (el.closest('.viewport') ?? document.documentElement).getBoundingClientRect()
  const side = document.querySelector('.side')?.getBoundingClientRect()
  const bar = document.querySelector('.topbar')?.getBoundingClientRect()
  return {
    left: view.left,
    top: bar ? Math.max(view.top, bar.bottom) : view.top,
    right: side && side.width > 0 ? Math.min(view.right, side.left) : view.right,
    bottom: view.bottom,
  }
}
