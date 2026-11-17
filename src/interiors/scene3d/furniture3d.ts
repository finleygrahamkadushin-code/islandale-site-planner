import { FURNITURE } from '../furniture/furniture'
import type { Box3 } from './interior3d'

/**
 * Detailed 3D shapes for a few furniture types, drawn as several boxes in the
 * item's own frame (feet: u across, v deep, back at v = -d/2, front at +d/2).
 * Types not listed here stay one plain box. `y0` is the floor under the piece.
 */

type Part = readonly [u: number, v: number, y: number, w: number, h: number, d: number, color: string]

const SHAPES: Readonly<Record<string, (w: number, d: number, h: number) => Part[]>> = {
  nightstand(w, d, h) {
    const wood = FURNITURE.nightstand.color
    const dark = '#6f5a40'
    const leg = Math.min(0.3, h * 0.15)
    const top = 0.08
    const bodyH = h - leg - top
    return [
      [0, 0, leg + bodyH / 2, w - 0.1, bodyH, d - 0.1, wood],
      [0, 0, h - top / 2, w, top, d, dark],
      // drawer front proud of the body, with a gap line above and a pull
      [0, d / 2 - 0.04, leg + bodyH * 0.55, w - 0.3, bodyH * 0.7, 0.06, '#b99a74'],
      [0, d / 2, leg + bodyH * 0.55, Math.min(0.5, w * 0.3), 0.07, 0.06, dark],
      // short legs
      ...([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([a, b]): Part => [a * (w / 2 - 0.1), b * (d / 2 - 0.1), leg / 2, 0.14, leg, 0.14, dark]),
    ]
  },
  dishwasher(w, d, h) {
    const steel = FURNITURE.dishwasher.color
    const kick = 0.3
    return [
      [0, 0, h / 2, w, h, d - 0.06, '#bfc2c5'],
      // front door panel, a control strip above it and a handle bar standing off it
      [0, d / 2 - 0.03, kick + (h - kick - 0.4) / 2, w - 0.06, h - kick - 0.4, 0.06, steel],
      [0, d / 2 - 0.03, h - 0.2, w - 0.06, 0.4, 0.06, '#8d9195'],
      [0, d / 2 + 0.08, h - 0.65, w - 0.5, 0.09, 0.09, '#5c5f63'],
      [-(w / 2 - 0.3), d / 2 + 0.04, h - 0.65, 0.07, 0.09, 0.12, '#5c5f63'],
      [w / 2 - 0.3, d / 2 + 0.04, h - 0.65, 0.07, 0.09, 0.12, '#5c5f63'],
      [0, d / 2 - 0.03, kick / 2, w, kick, 0.06, '#444'],
    ]
  },
  sink(w, d, h) {
    const cab = FURNITURE.sink.color
    const top = '#e4e0d8'
    const steel = '#9aa0a6'
    const mx = Math.min(0.4, w * 0.15)
    const bw = w - 2 * mx
    const back = 0.4
    const front = 0.3
    const bd = d - back - front
    const depth = 0.6
    const bc = (back - front) / 2 // basin centre in v
    return [
      // base cabinet below the basin, and the countertop ring around it
      [0, 0, (h - depth) / 2, w, h - depth, d, cab],
      [0, -d / 2 + back / 2, h - depth / 2, w, depth, back, top],
      [0, d / 2 - front / 2, h - depth / 2, w, depth, front, top],
      [-(w / 2 - mx / 2), bc, h - depth / 2, mx, depth, bd, top],
      [w / 2 - mx / 2, bc, h - depth / 2, mx, depth, bd, top],
      // basin floor, recessed below the top, and a drain
      [0, bc, h - depth + 0.02, bw, 0.04, bd, steel],
      [0, bc, h - depth + 0.05, 0.2, 0.02, 0.2, '#555'],
      // door line on the front of the cabinet
      [0, d / 2 + 0.005, (h - depth) / 2, 0.03, h - depth - 0.2, 0.02, '#8f887b'],
      // faucet: a post at the back and a spout reaching over the basin
      [0, -d / 2 + back / 2, h + 0.35, 0.12, 0.7, 0.12, '#c9cdd1'],
      [0, -d / 2 + back / 2 + 0.28, h + 0.65, 0.08, 0.08, 0.6, '#c9cdd1'],
    ]
  },
}

/** The boxes that draw `it` where it stands, or null when the type is one plain box. */
export function furnitureBoxes(it: { type: string; x: number; z: number; w: number; d: number }, y0: number, h: number, ry: number): Box3[] | null {
  const f = SHAPES[it.type]
  if (!f) return null
  const c = Math.cos(ry)
  const s = Math.sin(ry)
  return f(it.w, it.d, h).map(([u, v, y, w, hh, d, color]): Box3 => ({
    p: [it.x + u * c + v * s, y0 + y, it.z - u * s + v * c],
    size: [w, hh, d],
    ry,
    color,
    part: 'furniture',
  }))
}
