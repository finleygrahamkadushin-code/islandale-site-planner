import { beforeAll, describe, expect, test } from 'vitest'
import { FIT } from '../../buildings/openings/openingLayout'
import { GLASS_WALL_FT } from '../../buildings/walls/wallShell'
import { sheetBuildings } from '../../export/sheets/model'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { planLayout } from './planLayout'
import { thicknessMarks, wallNotes, wallRuns } from './planWalls'

const store = () => usePlanStore.getState()

function building(params: Record<string, unknown>) {
  const base = store().plan.objects['C-2']
  const o: PlanObject = { ...base, params: { ...base.params, pts: undefined, wings: [], cuts: [], ...params } }
  return sheetBuildings([o], store().site.terrain)[0]
}

beforeAll(() => {
  store().setReadOnly(null)
  store().loadScheme('C')
})

describe('wallRuns', () => {
  const e = (glass: boolean, thicknessFt = 1) => ({ glass, thicknessFt })
  test('one kind right round is one closed run', () => {
    expect(wallRuns([e(false), e(false), e(false)])).toEqual([{ glass: false, edges: [0, 1, 2], closed: true }])
  })
  test('runs start where the kind changes and wrap through vertex 0', () => {
    expect(wallRuns([e(true), e(false), e(false), e(true)])).toEqual([
      { glass: false, edges: [1, 2], closed: false },
      { glass: true, edges: [3, 0], closed: false },
    ])
  })
  test('a part with no walls has none', () => {
    expect(wallRuns([e(false, 0), e(false, 0)])).toEqual([])
  })
})

describe('thickness dimensions and notes', () => {
  test('a rect gets one dimension, on its longest wall, clear of its window, square across the wall', () => {
    const b = building({ shape: 'rect', w: 24, d: 16, cuts: [{ id: 1, edge: 0, kind: 'window', x: 10, w: 4, h: 4, sill: 3 }] })
    const marks = thicknessMarks(b.parts[0])
    expect(marks).toHaveLength(1)
    const [m] = marks
    expect(m.thicknessFt).toBe(FIT.wallFt)
    expect(Math.hypot(m.inner[0] - m.outer[0], m.inner[1] - m.outer[1])).toBeCloseTo(FIT.wallFt, 9)
    const e = b.parts[0].edges.find((x) => Math.abs((m.outer[0] - x.a[0]) * (x.b[1] - x.a[1]) - (m.outer[1] - x.a[1]) * (x.b[0] - x.a[0])) < 1e-6)
    expect(e?.lengthFt).toBeCloseTo(24, 9)
    // not within the window on that wall
    const o = b.parts[0].openings[0].pieces[0]
    const along = (p: readonly [number, number]) => p[0]
    const [lo, hi] = [Math.min(along(o.a), along(o.b)), Math.max(along(o.a), along(o.b))]
    if (e?.index === 0) expect(along(m.outer) < lo || along(m.outer) > hi).toBe(true)
  })

  test('a part with glass and solid walls dimensions each, and the notes say both', () => {
    const b = building({ shape: 'rect', w: 24, d: 16, ext: { walls: { '0:1': { kind: 'glass' } } }, cuts: [{ id: 1, edge: 2, kind: 'door', x: 4, w: 3, h: 7, sill: 0 }] })
    expect(thicknessMarks(b.parts[0]).map((m) => [m.glass, m.thicknessFt])).toEqual([
      [false, FIT.wallFt],
      [true, GLASS_WALL_FT],
    ])
    const notes = wallNotes(b)
    expect(notes[0]).toBe('All dimensions are to the outside face of the walls.')
    expect(notes[1]).toBe('Walls 8" thick, hatched; glass curtain walls 2 1/4".')
    expect(notes.join(' ')).toMatch(/Door swings \(dashed\) are assumed/)
    expect(planLayout(b, 0.25).general?.lines).toEqual(notes)
  })

  test('a curved part with no straight wall is dimensioned on a curve', () => {
    const b = building({ shape: 'ellipse', w: 30, d: 20 })
    expect(thicknessMarks(b.parts[0])).toHaveLength(1)
    expect(planLayout(b, 0.25).arcs.every((a) => a.innerRadiusFt !== null && a.innerRadiusFt < a.radiusFt)).toBe(true)
  })

  test('the general notes sit under the rest of the drawing, inside its extent', () => {
    const b = sheetBuildings([store().plan.objects['C-0']], store().site.terrain)[0]
    const layout = planLayout(b, 0.25)
    const g = layout.general
    if (!g) throw new Error('no general notes')
    expect(g.at[1]).toBeGreaterThan(b.bounds.maxz)
    expect(g.at[1] + g.lines.length * 0.5).toBeLessThan(layout.extent.y + layout.extent.h)
  })

  test("C4's curved prow wall is labelled once with both radii, not again for the deck along it", () => {
    store().loadScheme('C4')
    const id = store().plan.order.find((x) => store().plan.objects[x].type === 'house') ?? ''
    const b = sheetBuildings([store().plan.objects[id]], store().site.terrain)[0]
    const wall = b.parts[0].arcs[0]
    expect(wall.innerRadiusFt).toBeCloseTo(wall.radiusFt - FIT.wallFt, 9)
    const same = planLayout(b, 0.25).arcs.filter((a) => Math.abs(a.radiusFt - wall.radiusFt) < 1e-6)
    expect(same).toHaveLength(1)
    expect(same[0].innerRadiusFt).not.toBeNull()
    store().loadScheme('C')
  })
})
