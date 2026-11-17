import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import * as G from '../geom'
import type { Room } from '../types'
import { OpeningMark, type Transform } from './PlanLayers'

/**
 * The plan symbols for interior openings. Each is drawn from the stored
 * opening alone, so the markup can be checked without a browser.
 */

const t: Transform = { S: 10, X: (x) => x * 10 + 200, Y: (z) => z * 10 + 200 }
const rect = (id: number, x0: number, x1: number): Room => ({ id, name: `R${id}`, type: 'hall', pts: G.rectFrom2([x0, -10], [x1, 10]) })
// two rooms side by side: the wall between them is at x = 0
const rooms = [rect(1, -15, 0), rect(2, 0, 15)]
const params = { w: 30, d: 20, h: 9 }

/** Room 1's edge that lies on x = 0, the wall between the two rooms. */
const wallEdge = (): number => G.edges(rooms[0].pts).findIndex((e) => Math.abs(e.a[0]) < 1e-9 && Math.abs(e.b[0]) < 1e-9)

function symbol(kind: 'door' | 'pocket' | 'folding' | 'slider' | 'window' | 'open', over: Partial<{ flip: boolean; out: boolean; width: number }> = {}): string {
  const width = over.width ?? (kind === 'pocket' ? 2.5 : kind === 'folding' ? 6 : 3)
  const op = { room: 1, edge: wallEdge(), pos: 0.5, width, kind, flip: over.flip ?? false, out: over.out ?? false }
  return renderToStaticMarkup(createElement('svg', null, createElement(OpeningMark, { params, fi: 0, op, rooms, t, color: '#000', hit: false })))
}

describe('pocket and folding door symbols', () => {
  test('a pocket door is a leaf across the opening and a dashed run in the wall, with no swing arc', () => {
    const svg = symbol('pocket')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).not.toContain(' A')
    // the leaf and the dashed run are both lines; a door has its leaf and an arc
    expect((svg.match(/<line /g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  test('a pocket door is drawn on the other side of the jamb when flipped, and both ways without throwing', () => {
    const a = symbol('pocket')
    const b = symbol('pocket', { flip: true })
    expect(a).not.toEqual(b)
  })

  test('a folding door is a zig-zag of four panels for a 6 ft opening, and two for a narrow one, with no swing arc', () => {
    const wide = symbol('folding')
    const points = (svg: string) => svg.match(/<polyline [^>]*points="([^"]+)"/)?.[1].trim().split(' ').length
    expect(points(wide)).toBe(5)
    expect(wide).not.toContain(' A')
    expect(points(symbol('folding', { width: 3 }))).toBe(3)
    expect(points(symbol('folding', { out: true }))).toBe(5)
  })

  test('the old kinds still draw the same way: a door keeps its swing arc', () => {
    expect(symbol('door')).toContain(' A')
    expect(symbol('door')).not.toContain('<polyline')
    expect(symbol('window')).not.toContain('<polyline')
  })
})
