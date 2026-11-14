import { describe, expect, test } from 'vitest'
import { FIT, layoutOpenings } from './openingLayout'
import type { LocalPoint } from '../footprint'
import { buildingMasses, massPoly } from '../masses'
import { fitMass, refitAll, withCutIds } from './openingEdits'
import { planFromScheme } from '../../store/fromLegacy'
import { loadSchemes, schemeById } from '../../site/schemes'

// a 20 x 12 ft box wound like footprint.ts rectangles: edge 0 is the back wall (z = -6), edge 1 the right end
const box: LocalPoint[] = [
  [-10, -6],
  [10, -6],
  [10, 6],
  [-10, 6],
]
const opts = { wallHeightFt: 9 }
const one = (cut: object, poly: LocalPoint[] = box, o: object = opts) => layoutOpenings(poly, [cut], { ...opts, ...o })

describe('opening fit rules', () => {
  test('a window 0.2 ft from a square corner moves to 0.75 ft plus trim', () => {
    const r = one({ id: 1, kind: 'window', edge: 0, x: 0.2, w: 3, h: 4, sill: 3 })
    expect(r.openings[0].x).toBeCloseTo(FIT.cornerFt + FIT.trimFt, 6)
    expect(r.notes[0]).toMatchObject({ id: 1, field: 'x', wanted: 0.2, reason: expect.stringContaining('corner') })
  })

  test('a sharper corner needs more room than a square one', () => {
    // a long thin wedge: edge 1 ends (on its left, seen from outside) in a very sharp point
    const wedge: LocalPoint[] = [
      [-2, 10],
      [2, 10],
      [0, -10],
    ]
    const r = one({ id: 1, kind: 'window', edge: 1, x: 0, w: 2, h: 3, sill: 3 }, wedge)
    expect(r.openings[0].x).toBeGreaterThan(FIT.cornerFt + FIT.trimFt + 0.1)
  })

  test('two overlapping windows end at least 4 in apart', () => {
    const r = layoutOpenings(
      box,
      [
        { id: 1, kind: 'window', edge: 0, x: 4, w: 4, h: 4, sill: 3 },
        { id: 2, kind: 'window', edge: 0, x: 6, w: 4, h: 4, sill: 3 },
      ],
      opts,
    )
    const [a, b] = r.openings
    const gap = b.x - b.trim - (a.x + a.w + a.trim)
    expect(gap).toBeGreaterThanOrEqual(FIT.gapFt - 1e-9)
    expect(b.conflict).toBe(false)
    expect(r.notes.some((n) => n.id === 2 && n.reason.includes('next opening'))).toBe(true)
  })

  test('openings that cannot all fit on a short wall are narrowed, then marked as a conflict', () => {
    const r = layoutOpenings(
      box,
      [
        { id: 1, kind: 'window', edge: 1, x: 1, w: 9, h: 4, sill: 3 },
        { id: 2, kind: 'window', edge: 1, x: 2, w: 3, h: 4, sill: 3 },
        { id: 3, kind: 'window', edge: 1, x: 3, w: 3, h: 4, sill: 3 },
      ],
      opts,
    )
    expect(r.openings.some((o) => o.conflict)).toBe(true)
  })

  test('a door with sill 0 sits on the slab, and a window with sill 0 keeps it', () => {
    expect(one({ kind: 'door', edge: 0, x: 8, w: 3, h: 7, sill: 0 }).openings[0].sill).toBe(0)
    expect(one({ kind: 'window', edge: 0, x: 8, w: 3, h: 4, sill: 0 }).openings[0].sill).toBe(0)
    expect(one({ kind: 'door', edge: 0, x: 8, w: 3, h: 7, sill: -1 }).openings[0].sill).toBe(0)
  })

  test('the head stays 0.5 ft under the roof line, including where the roof dips', () => {
    const r = one({ id: 4, kind: 'window', edge: 0, x: 8, w: 3, h: 6, sill: 3 })
    expect(r.openings[0].sill + r.openings[0].h).toBeCloseTo(9 - FIT.headFt, 6)
    const dipped = one({ id: 4, kind: 'slider', edge: 0, x: 8, w: 6, h: 8, sill: 0 }, box, { roofLineFt: () => 7.5 })
    expect(dipped.openings[0].sill + dipped.openings[0].h).toBeCloseTo(7, 6)
    expect(dipped.notes.find((n) => n.field === 'h')?.reason).toContain('under the eave')
  })

  test('an opening on a wall covered by another mass is hidden, not deleted', () => {
    const r = one({ kind: 'window', edge: 0, x: 8, w: 3, h: 4, sill: 3 }, box, { buried: ([, z]: LocalPoint) => z < -6 })
    expect(r.openings[0].hidden).toBe(true)
    expect(r.cuts).toHaveLength(1)
  })

  test('a cut-out stays a cut-out, and keeps its id', () => {
    const r = one({ id: 7, kind: 'cutout', edge: 0, x: 8, w: 3, h: 4, sill: 3 })
    expect(r.openings[0]).toMatchObject({ id: 7, kind: 'cutout' })
  })

  test('one along-cut is one opening with jambs only at its ends and at the sharp corner it turns', () => {
    // the first runs 16 ft along the 20 ft back wall from vertex 0; the second turns the corner onto the end wall
    const straight = one({ id: 1, kind: 'window', along: true, x: 2, w: 16, h: 4, sill: 3 })
    expect(straight.openings).toHaveLength(1)
    expect(straight.openings[0].pieces).toHaveLength(1)
    const turning = one({ id: 2, kind: 'window', along: true, x: 16, w: 8, h: 4, sill: 3 })
    expect(turning.openings).toHaveLength(1)
    const [p, q] = turning.openings[0].pieces
    expect([p.jambRight, p.jambLeft, q.jambRight, q.jambLeft]).toEqual([true, true, false, true])
  })

  test('a cut on a wall that no longer exists is kept and reported, not silently dropped', () => {
    const r = one({ id: 9, kind: 'window', edge: 12, x: 1, w: 3, h: 4, sill: 3 })
    expect(r.openings).toHaveLength(0)
    expect(r.cuts).toHaveLength(1)
    expect(r.notes[0]).toMatchObject({ id: 9, field: 'edge' })
  })

  test('a cut that already fits is left exactly as it is', () => {
    const r = one({ id: 1, kind: 'window', edge: 0, x: 8, w: 3, h: 4, sill: 3 })
    expect(r.notes).toEqual([])
    expect(r.cuts[0]).toEqual({ id: 1, kind: 'window', edge: 0, x: 8, w: 3, h: 4, sill: 3 })
  })
})

describe('openings on curved and outline walls (along-cuts) keep the fit rules', () => {
  // a 24 x 16 ft ellipse as 48 short chords: one wall all the way round
  const ellipse: LocalPoint[] = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * 2 * Math.PI
    return [12 * Math.cos(a), 8 * Math.sin(a)] as const
  })
  const perimOf = (poly: readonly LocalPoint[]) => poly.reduce((s, a, i) => s + Math.hypot(poly[(i + 1) % poly.length][0] - a[0], poly[(i + 1) % poly.length][1] - a[1]), 0)
  const piecesWidth = (o: { pieces: readonly { w: number }[] }) => o.pieces.reduce((s, q) => s + q.w, 0)

  test('two overlapping along-cuts end at least 4 in apart, with no conflict when there is room', () => {
    const r = layoutOpenings(
      ellipse,
      [
        { id: 1, kind: 'window', along: true, x: 10, w: 6, h: 4, sill: 3 },
        { id: 2, kind: 'window', along: true, x: 13, w: 6, h: 4, sill: 3 },
      ],
      opts,
    )
    const [a, b] = r.openings
    expect(b.x - b.trim - (a.x + a.w + a.trim)).toBeGreaterThanOrEqual(FIT.gapFt - 1e-9)
    expect(b.w).toBeCloseTo(6, 9)
    expect(b.conflict).toBe(false)
    expect(r.notes.some((n) => n.id === 2 && n.field === 'x' && n.reason.includes('next opening'))).toBe(true)
  })

  test('along-cuts that cannot all fit round the wall are marked as a conflict', () => {
    const perim = perimOf(ellipse)
    // like a straight wall: the third is narrowed into what is left, the fourth has no room at all
    const cuts = [0, 1, 2, 3].map((k) => ({ id: k + 1, kind: 'window', along: true, x: k * 2, w: perim / 2.5, h: 4, sill: 3 }))
    const r = layoutOpenings(ellipse, cuts, opts)
    expect(r.openings.some((o) => o.conflict)).toBe(true)
  })

  test('an along-cut keeps clear of a straight-wall opening on the walls it runs along, and the other way round', () => {
    const edgeCut = { id: 1, kind: 'window', edge: 0, x: 8, w: 4, h: 4, sill: 3 }
    const alongCut = { id: 2, kind: 'window', along: true, x: 6, w: 4, h: 4, sill: 3 }
    for (const cuts of [[edgeCut, alongCut], [alongCut, edgeCut]]) {
      const r = layoutOpenings(box, cuts, opts)
      const e = r.openings.find((o) => !o.along)!
      const a = r.openings.find((o) => o.along)!
      // the edge cut's outer frame, measured from vertex 0 like the along-cut
      const eFrame = [20 - (e.x + e.w + e.trim), 20 - (e.x - e.trim)]
      const aFrame = [a.x - a.trim, a.x + a.w + a.trim]
      const gap = Math.max(eFrame[0] - aFrame[1], aFrame[0] - eFrame[1])
      expect(gap).toBeGreaterThanOrEqual(FIT.gapFt - 1e-9)
      expect(r.openings.some((o) => o.conflict)).toBe(false)
    }
  })

  test('an along-cut that runs past vertex 0 carries on round the wall instead of being cut short', () => {
    const perim = perimOf(ellipse)
    const r = one({ id: 1, kind: 'window', along: true, x: perim - 2, w: 6, h: 4, sill: 3 }, ellipse)
    expect(piecesWidth(r.openings[0])).toBeCloseTo(6, 6)
  })

  test('a door too wide for a 1.2 ft wall stays on that wall and is marked as a conflict', () => {
    const k = 1.2 / Math.SQRT2
    // a box with one corner chamfered by a 1.2 ft wall (edge 3)
    const chamfered: LocalPoint[] = [[-5, -5], [5, -5], [5, 5], [-5 + k, 5], [-5, 5 - k]]
    const r = one({ id: 1, kind: 'door', edge: 3, x: 0, w: 3, h: 7, sill: 0 }, chamfered)
    const o = r.openings[0]
    expect(o.conflict).toBe(true)
    expect(o.x - o.trim).toBeGreaterThanOrEqual(-1e-9)
    expect(o.x + o.w + o.trim).toBeLessThanOrEqual(1.2 + 1e-9)
    expect(o.w).toBeGreaterThan(0)
  })

  test('on a wall too low for the head clearance the height is never negative and stays inside the wall', () => {
    for (const cut of [{ id: 1, kind: 'door', edge: 0, x: 8, w: 3, h: 7, sill: 0 }, { id: 2, kind: 'window', along: true, x: 4, w: 3, h: 4, sill: 3 }]) {
      const o = one(cut, box, { wallHeightFt: 0.3 }).openings[0]
      expect(o.h).toBeGreaterThanOrEqual(0)
      expect(o.sill).toBeGreaterThanOrEqual(0)
      expect(o.sill + o.h).toBeLessThanOrEqual(0.3 + 1e-9)
    }
  })
})

describe('the opening check list for Scheme C', () => {
  test('Scheme C: after Fit all, openings clear corners, keep 4 in apart, stay under the eave and on the floor', () => {
    const plan = planFromScheme(schemeById(loadSchemes(), 'C'))
    for (const o of Object.values(plan.objects)) {
      if (o.type !== 'house') continue
      const { params } = refitAll(withCutIds(o.params))
      buildingMasses(params).forEach((m, mi) => {
        if (m.kind !== 'wall') return
        const { openings } = fitMass(params, mi)
        const poly = massPoly(m)
        for (const op of openings) {
          const where = `${o.name} mass ${mi} cut ${op.id}`
          expect(op.sill, where).toBeGreaterThanOrEqual(0)
          expect(op.sill + op.h, where).toBeLessThanOrEqual(m.h - FIT.headFt + 1e-6)
          if (op.along) continue
          const a = poly[op.edge]
          const b = poly[(op.edge + 1) % poly.length]
          const len = Math.hypot(b[0] - a[0], b[1] - a[1])
          expect(op.x - op.trim, where).toBeGreaterThanOrEqual(FIT.cornerFt - 1e-6)
          expect(len - op.x - op.w - op.trim, where).toBeGreaterThanOrEqual(FIT.cornerFt - 1e-6)
          expect(op.conflict, where).toBe(false)
          for (const other of openings) {
            if (other === op || other.along || other.edge !== op.edge || other.x < op.x) continue
            expect(other.x - other.trim - (op.x + op.w + op.trim), `${where} and ${other.id}`).toBeGreaterThanOrEqual(FIT.gapFt - 1e-6)
          }
        }
      })
    }
  })
})
