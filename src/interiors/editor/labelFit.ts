import type { Pt } from '../geom'

/**
 * How a room's label fits inside the room on the plan: its name, then its
 * size and area while there is room for them, at a font that shrinks before
 * the label is dropped. A label that fits inside its own room can't run
 * into a neighbour's.
 */

/** Largest and smallest label font, pixels. */
const FONT_MAX = 12
const FONT_MIN = 7
/** Line height and rough glyph width, as shares of the font size. */
const LINE = 1.25
const GLYPH = 0.6
/** Clear space kept round the text (its halo is 3 px), pixels. */
const PAD = 4

/** How far the room reaches from p along +x, −x, +z and −z, feet (Infinity where the outline is open). */
function reach(P: readonly Pt[], p: Pt): { readonly x: number; readonly z: number } {
  let l = Infinity
  let r = Infinity
  let u = Infinity
  let d = Infinity
  for (let i = 0; i < P.length; i++) {
    const a = P[i]
    const b = P[(i + 1) % P.length]
    if ((a[1] > p[1]) !== (b[1] > p[1])) {
      const x = a[0] + ((p[1] - a[1]) / (b[1] - a[1])) * (b[0] - a[0])
      if (x >= p[0]) r = Math.min(r, x - p[0])
      else l = Math.min(l, p[0] - x)
    }
    if ((a[0] > p[0]) !== (b[0] > p[0])) {
      const z = a[1] + ((p[0] - a[0]) / (b[0] - a[0])) * (b[1] - a[1])
      if (z >= p[1]) d = Math.min(d, z - p[1])
      else u = Math.min(u, p[1] - z)
    }
  }
  return { x: 2 * Math.min(l, r), z: 2 * Math.min(u, d) }
}

export interface RoomLabel {
  readonly lines: readonly string[]
  /** Font of the first line; the others are 0.9 of it. */
  readonly fs: number
}

/**
 * The label for a room drawn at S pixels per foot, centred on `at`, or null
 * when not even the name fits. `minSide` (feet) sets the preferred font, as
 * before: a quarter of the room's short side on screen, 8 to 12 px.
 */
export function roomLabel(pts: readonly Pt[], at: Pt, S: number, minSide: number, name: string, details: readonly string[]): RoomLabel | null {
  const room = reach(pts, at)
  const w = room.x * S - 2 * PAD
  const h = room.z * S - 2 * PAD
  const fits = (lines: readonly string[], fs: number) =>
    lines.length * LINE * fs <= h && lines.every((t, k) => t.length * GLYPH * (k ? 0.9 : 1) * fs <= w)
  const preferred = Math.max(8, Math.min(FONT_MAX, (minSide * S) / 4))
  for (let fs = preferred; fs >= FONT_MIN; fs -= 1) {
    for (const lines of [[name, ...details], [name]]) if (fits(lines, fs)) return { lines, fs }
  }
  return null
}
