/**
 * Where the tour's card sits when its step is about the whole view (R9.7):
 * in the corner of the free part of the view that covers least of the
 * model, measured by the labels over it, so the first card never hides the
 * buildings it asks the newcomer to look at.
 */

export interface Box {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** Room left between the card and the edge of the free area. */
const MARGIN = 16

const overlap = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

/** The card's top-left corner: the free area's corner (top-left first on a tie) whose card covers least of the obstacles. */
export function clearSpot(area: Box, card: { readonly width: number; readonly height: number }, obstacles: readonly Box[]): { left: number; top: number } {
  const margin = (span: number, size: number) => Math.max(0, Math.min(MARGIN, (span - size) / 2))
  const mx = margin(area.right - area.left, card.width)
  const my = margin(area.bottom - area.top, card.height)
  const xs = [area.left + mx, Math.max(area.left + mx, area.right - mx - card.width)]
  const ys = [area.top + my, Math.max(area.top + my, area.bottom - my - card.height)]
  // top-left, top-right, bottom-left, bottom-right
  const corners = ys.flatMap((top) => xs.map((left) => ({ left, top })))
  let best = corners[0]
  let bestCover = Infinity
  for (const c of corners) {
    const box = { left: c.left, top: c.top, right: c.left + card.width, bottom: c.top + card.height }
    const cover = obstacles.reduce((sum, o) => sum + overlap(box, o), 0)
    if (cover < bestCover) {
      best = c
      bestCover = cover
    }
  }
  return best
}
