import { describe, expect, test } from 'vitest'
import { signedArea } from '../../buildings/footprint'
import {
  arcMidpoint,
  arrowHead,
  dimensionLine,
  insidePolygon,
  normalAwayFrom,
  northOnSheetDeg,
  outwardNormal,
  sideOf,
  spreadApart,
  staggerLevel,
  uprightAngle,
  type DimOpts,
  type Pt,
} from './svgDims'

const OPTS: DimOpts = { gapFt: 0.25, overshootFt: 0.5, tickFt: 0.3, textOffsetFt: 0.4 }
const W = 20
const D = 12
/** Counter-clockwise in a y-up frame, so signedArea > 0. */
const RECT: readonly Pt[] = [
  [-W / 2, -D / 2],
  [W / 2, -D / 2],
  [W / 2, D / 2],
  [-W / 2, D / 2],
]
const edge = (i: number): readonly [Pt, Pt] => [RECT[i], RECT[(i + 1) % RECT.length]]
const outward = (i: number) => {
  const [a, b] = edge(i)
  return dimensionLine(a, b, 2.5, { ...OPTS, normal: outwardNormal(signedArea(RECT), a, b) })
}

describe('dimension lines', () => {
  test('the fixture rectangle has a positive signed area', () => {
    expect(signedArea(RECT)).toBeGreaterThan(0)
  })

  test('the back edge (z = -d/2) is dimensioned behind it, at z < -d/2', () => {
    const dim = outward(0)
    expect(dim.line.a[1]).toBeCloseTo(-D / 2 - 2.5)
    expect(dim.line.b[1]).toBeCloseTo(-D / 2 - 2.5)
    expect(dim.text.y).toBeLessThan(dim.line.a[1])
    expect(dim.ext1.a[1]).toBeCloseTo(-D / 2 - 0.25)
    expect(dim.ext1.b[1]).toBeCloseTo(-D / 2 - 3)
  })

  test('every edge of the rectangle is dimensioned outside it', () => {
    for (let i = 0; i < 4; i++) {
      const dim = outward(i)
      const mid: Pt = [(dim.line.a[0] + dim.line.b[0]) / 2, (dim.line.a[1] + dim.line.b[1]) / 2]
      expect(insidePolygon(RECT, mid)).toBe(false)
      expect(Math.abs(mid[0]) > W / 2 || Math.abs(mid[1]) > D / 2).toBe(true)
    }
  })

  test('the default normal is outward for a positive signed area', () => {
    const [a, b] = edge(2)
    expect(dimensionLine(a, b, 2.5, OPTS).line.a[1]).toBeCloseTo(D / 2 + 2.5)
  })

  test('the measured value is the edge length', () => {
    expect(outward(0).text.value).toBeCloseTo(W)
    expect(outward(1).text.value).toBeCloseTo(D)
  })

  test('text reads upright whichever way the edge runs', () => {
    for (let i = 0; i < 4; i++) {
      const angle = outward(i).text.angleDeg
      expect(angle).toBeGreaterThan(-90)
      expect(angle).toBeLessThanOrEqual(90)
    }
    expect(outward(0).text.angleDeg).toBeCloseTo(0)
    expect(outward(2).text.angleDeg).toBeCloseTo(0)
  })

  test('ticks are 45° slashes centred on the line ends', () => {
    const dim = outward(0)
    const [t] = dim.ticks
    expect((t.a[0] + t.b[0]) / 2).toBeCloseTo(dim.line.a[0])
    expect((t.a[1] + t.b[1]) / 2).toBeCloseTo(dim.line.a[1])
    expect(Math.abs(t.b[0] - t.a[0])).toBeCloseTo(Math.abs(t.b[1] - t.a[1]))
  })
})

describe('upright angles', () => {
  test('folds every angle into (-90, 90]', () => {
    expect(uprightAngle(180)).toBeCloseTo(0)
    expect(uprightAngle(-90)).toBeCloseTo(90)
    expect(uprightAngle(90)).toBeCloseTo(90)
    expect(uprightAngle(135)).toBeCloseTo(-45)
    expect(uprightAngle(-135)).toBeCloseTo(45)
    expect(uprightAngle(270)).toBeCloseTo(90)
  })
})

describe('layout helpers', () => {
  test('sides follow SVG axes, y down', () => {
    expect(sideOf([0, -1])).toBe('top')
    expect(sideOf([0, 1])).toBe('bottom')
    expect(sideOf([-1, 0.2])).toBe('left')
    expect(sideOf([1, 0])).toBe('right')
  })

  test('stagger skips levels taken by overlapping lines on the same side only', () => {
    const placed = [
      { side: 'top' as const, lo: 0, hi: 10, level: 0 },
      { side: 'top' as const, lo: 5, hi: 15, level: 1 },
      { side: 'left' as const, lo: 0, hi: 10, level: 2 },
    ]
    expect(staggerLevel(placed, 'top', 8, 12, 0)).toBe(2)
    expect(staggerLevel(placed, 'top', 20, 30, 0)).toBe(0)
    expect(staggerLevel(placed, 'left', 0, 10, 0)).toBe(0)
  })

  test('an opening normal points away from the outline whichever way it runs', () => {
    const n1 = normalAwayFrom(RECT, [-2, D / 2], [2, D / 2])
    const n2 = normalAwayFrom(RECT, [2, D / 2], [-2, D / 2])
    expect(n1[1]).toBeCloseTo(1)
    expect(n2[1]).toBeCloseTo(1)
  })

  test('an opening cut straight across a curved wall still faces out', () => {
    const r = 10
    const arc: Pt[] = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 8) * Math.PI
      return [r * Math.cos(a), r * Math.sin(a)]
    })
    const disc = [...arc].reverse()
    const n = normalAwayFrom(disc, arc[3], arc[5])
    expect(n[1]).toBeGreaterThan(0.9)
    expect(normalAwayFrom(arc, arc[5], arc[3])[1]).toBeGreaterThan(0.9)
  })

  test('the arc midpoint lies on the circle halfway round', () => {
    const r = 10
    const pts: Pt[] = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 6) * (Math.PI / 2)
      return [r * Math.cos(a), r * Math.sin(a)]
    })
    const [x, y] = arcMidpoint(pts, [0, 0], r)
    expect(Math.hypot(x, y)).toBeCloseTo(r)
    expect(x).toBeCloseTo(y)
  })

  test('an arrowhead has its tip at the target', () => {
    const [tip, l, r] = arrowHead([0, 0], [0, 5], 1)
    expect(tip).toEqual([0, 5])
    expect(l[1]).toBeCloseTo(4)
    expect(r[1]).toBeCloseTo(4)
  })
})

describe('north on the plan sheet', () => {
  test('points up at rotation 0, where the building front (+z) faces south', () => {
    expect(northOnSheetDeg(0)).toBeCloseTo(0)
  })

  test('turns clockwise on the sheet as the building turns counter-clockwise on the site', () => {
    // at 90° the building's +x points north, and +x is right on the sheet
    expect(northOnSheetDeg(90)).toBeCloseTo(90)
    expect(northOnSheetDeg(-30)).toBeCloseTo(-30)
    expect(Math.abs(northOnSheetDeg(180))).toBeCloseTo(180)
  })
})

describe('spreading labels', () => {
  test('keeps far-apart values and lifts crowded ones, in input order', () => {
    expect(spreadApart([0, 10], 1)).toEqual([0, 10])
    const out = spreadApart([9.25, 9, 0, 9.1], 0.5)
    expect(out[2]).toBe(0)
    expect(out[1]).toBe(9)
    expect(out[3]).toBeCloseTo(9.5)
    expect(out[0]).toBeCloseTo(10)
  })
})
