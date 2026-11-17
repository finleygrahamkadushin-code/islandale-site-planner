import { describe, expect, test } from 'vitest'
import { layoutOpenings, asKind, OPENING_KIND_LABEL, OPENING_KIND_NAME, type CutData } from './openingLayout'
import type { LocalPoint } from '../footprint'

// the 20 x 12 ft box from openingLayout.test.ts: edge 0 is the back wall (20 ft)
const box: LocalPoint[] = [
  [-10, -6],
  [10, -6],
  [10, 6],
  [-10, 6],
]

// a 10 ft radius ring of 24 vertices, wound the same way, for along-cuts
const ring: LocalPoint[] = Array.from({ length: 24 }, (_, i) => {
  const t = (i / 24) * 2 * Math.PI
  return [10 * Math.cos(t), 10 * Math.sin(t)] as LocalPoint
})

const opt = { wallHeightFt: 9 }

describe('folding exterior opening', () => {
  test('asKind keeps folding rather than falling back to a door', () => {
    expect(asKind('folding')).toBe('folding')
    expect(asKind('nonsense')).toBe('door')
  })

  test('the kind has its label and its schedule name', () => {
    expect(OPENING_KIND_LABEL.folding).toBe('Folding door')
    expect(OPENING_KIND_NAME.folding).toBe('folding door')
  })

  test('lays out and fits exactly like a slider on a straight wall', () => {
    const base: CutData = { edge: 0, x: 5, w: 8, sill: 0 }
    const slider = layoutOpenings(box, [{ ...base, kind: 'slider', id: 1 }], opt)
    const folding = layoutOpenings(box, [{ ...base, kind: 'folding', id: 1 }], opt)
    const s = slider.openings[0]
    const f = folding.openings[0]
    expect(f.kind).toBe('folding')
    expect(f.h).toBe(s.h)
    expect(f.sill).toBe(s.sill)
    expect(f.x).toBe(s.x)
    expect(f.w).toBe(s.w)
    expect(f.pieces).toHaveLength(1)
    expect(folding.notes).toEqual(slider.notes)
    expect(folding.cuts[0]).toMatchObject({ kind: 'folding', h: 7, sill: 0 })
  })

  test('a folding cut too tall for the wall is fitted the same way as a slider', () => {
    const tall: CutData = { edge: 0, x: 5, w: 8, h: 12, sill: 0 }
    const slider = layoutOpenings(box, [{ ...tall, kind: 'slider' }], opt)
    const folding = layoutOpenings(box, [{ ...tall, kind: 'folding' }], opt)
    expect(folding.openings[0].h).toBe(slider.openings[0].h)
    expect(folding.notes.map((n) => n.field)).toEqual(slider.notes.map((n) => n.field))
  })

  test('along a curve it breaks into several pieces, each with a width', () => {
    const r = layoutOpenings(ring, [{ kind: 'folding', along: true, x: 4, w: 12, id: 1 }], opt)
    const op = r.openings[0]
    expect(op.kind).toBe('folding')
    expect(op.pieces.length).toBeGreaterThan(1)
    for (const p of op.pieces) expect(p.w).toBeGreaterThan(0)
    const total = op.pieces.reduce((sum, p) => sum + p.w, 0)
    expect(total).toBeCloseTo(op.w, 6)
  })
})
