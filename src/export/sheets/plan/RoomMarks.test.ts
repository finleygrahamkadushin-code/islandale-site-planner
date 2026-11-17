import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { SheetInteriorOpening } from '../types'
import type { Pen } from './planLayout'
import { InteriorOpenings } from './RoomMarks'

/** The drawing sheets' marks for interior openings, checked as markup. */

const pen = { thin: 0.5, hair: 0.2, medium: 1, small: 0.6, text: 1 } as unknown as Pen

/** A partition along x from 0 to 6 ft, with the opening in its middle and the swing (or fold) towards +z. */
function opening(kind: SheetInteriorOpening['kind'], widthFt: number): SheetInteriorOpening {
  const a: [number, number] = [0, 0]
  const b: [number, number] = [widthFt, 0]
  return {
    kind, a, b, hinge: a, jamb: b, swing: [0, 1], widthFt, thicknessFt: 1 / 3, room: 'Hall', to: 'Den', swingsInto: null, inPartWall: false,
  } as unknown as SheetInteriorOpening
}

const marks = (o: SheetInteriorOpening) => renderToStaticMarkup(createElement('svg', null, createElement(InteriorOpenings, { openings: [o], pen })))

describe('pocket and folding doors on the drawing sheets', () => {
  test('a pocket door is a leaf and a dashed run in the partition, with no swing arc', () => {
    const svg = marks(opening('pocket', 2.5))
    expect(svg).toContain('stroke-dasharray')
    expect((svg.match(/<line /g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(svg).not.toContain(' A')
  })

  test('a folding door is a zig-zag of four panels on the swing side for 6 ft, two under 4 ft, with no swing arc', () => {
    const points = (svg: string) => svg.match(/<polyline [^>]*points="([^"]+)"/)?.[1].trim().split(' ').length
    expect(points(marks(opening('folding', 6)))).toBe(5)
    expect(points(marks(opening('folding', 3)))).toBe(3)
    expect(marks(opening('folding', 6))).not.toContain(' A')
  })

  test('a door still draws its swing and the old kinds are unchanged', () => {
    expect(marks(opening('door', 3))).toContain(' A')
    expect(marks(opening('window', 4))).not.toContain('<polyline')
  })
})
