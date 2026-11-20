import { beforeAll, describe, expect, test } from 'vitest'
import { sheetBuildings } from '../model/model'
import type { Scale, SheetBuilding } from '../types'
import { usePlanStore } from '../../../store/planStore'
import type { PlanObject } from '../../../store/types'
import { formatArch } from '../format'
import { tileDrawing } from '../tiles'
import { sideOf, spanAlong, type DimLine, type Pt } from '../svgDims'
import { cutMarkPadFt, cutReachIn, padExtent, sectionCuts } from '../section/sectionCuts'
import { planAt } from '../section/sectionGeom'
import { floorPlans } from './floorPlans'
import { clearFigures, datumLabelBox, dimText, overlaps, partLabelBox, partLabelSpots, sameRow, textsOverlap, type Box, type DimRow, type TurnedText } from './planDims'
import { dimSpacing, notesBelowCuts, OMITTED_NOTE, openingTagBoxes, penSizes, planBox, planLayout, type LabelledDim } from './planLayout'
import { partLabelsTaken, planFigures } from './roomLayout'

const store = () => usePlanStore.getState()
const objects = (): PlanObject[] => store().plan.order.map((id) => store().plan.objects[id])
const buildings = (): SheetBuilding[] => sheetBuildings(objects(), store().site.terrain)

/** The scale each building's plan prints at on Tabloid: the prow at 1/16", the cabins at 1/8". */
const PLAN_SCALE: Readonly<Record<string, Scale>> = { 'C-0': 0.0625, 'C-1': 0.125, 'C-2': 0.125, 'C-3': 0.125 }
const SCALES: readonly Scale[] = [0.0625, 0.125, 0.25]

const rowOf = (d: DimLine): DimRow => {
  const side = sideOf([d.line.a[0] - d.ext1.a[0], d.line.a[1] - d.ext1.a[1]])
  const [lo, hi] = spanAlong(side, d.line.a, d.line.b)
  return { side, lo, hi, value: d.text.value }
}

const pairs = <T>(xs: readonly T[]): (readonly [T, T])[] => xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b] as const))
const upright = (b: Box): TurnedText => ({ at: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2], halfW: (b.x1 - b.x0) / 2, halfH: (b.y1 - b.y0) / 2, angleDeg: 0 })
const said = (d: LabelledDim) => (d.label ? `${d.label} ${formatArch(d.text.value)}` : formatArch(d.text.value))

beforeAll(() => {
  store().setReadOnly(null)
  store().loadScheme('C')
})

describe('the rows of dimensions keep a line of figures apart on paper', () => {
  test('the spacing is the old feet at 1/8" and larger, and grows with the text below it', () => {
    expect(dimSpacing(penSizes(0.25))).toEqual({ first: 2.5, stagger: 1.5, overallGap: 2 })
    expect(dimSpacing(penSizes(0.125)).stagger).toBeCloseTo(1.5, 9)
    const small = penSizes(0.0625)
    expect(dimSpacing(small).stagger).toBeGreaterThan(small.text * 1.5)
    expect(dimSpacing(small).first).toBeGreaterThan(small.text * 1.5)
  })

  test("each overall size ('Overall', 'Main box', 'Steps overall', 'Roof overall') has a row to itself at every scale", () => {
    for (const scale of SCALES) {
      const pen = penSizes(scale)
      for (const b of buildings()) {
        const overall = planLayout(b, scale).dims.filter((d) => d.label)
        expect(overall.length).toBeGreaterThanOrEqual(2)
        for (const [p, q] of pairs(overall)) {
          expect(textsOverlap(dimText(p, p.label, pen.text), dimText(q, q.label, pen.text)), `${b.name} at ${scale}: ${said(p)} on ${said(q)}`).toBe(false)
        }
      }
    }
  })
})

describe('a dimension is given once', () => {
  test('no two rows run the same span of the same side at the same length', () => {
    for (const scale of SCALES) {
      for (const b of buildings()) {
        const rows = planLayout(b, scale).dims.filter((d) => !d.label)
        for (const [p, q] of pairs(rows)) expect(sameRow(rowOf(p), rowOf(q)), `${b.name} at ${scale}: ${said(p)} twice`).toBe(false)
      }
    }
  })

  test("the prow's porch still has its 12'-4\" side, once on each side", () => {
    const prow = buildings().find((b) => b.id === 'C-0')!
    const sides = planLayout(prow, 0.25).dims.filter((d) => !d.label && Math.abs(d.text.value - 12 - 4 / 12) < 1 / 48).map((d) => rowOf(d).side)
    expect(sides.sort()).toEqual(['left', 'right'])
  })
})

describe('figures that would overprint are left off', () => {
  const dim = (x: number, value: number, label?: string): LabelledDim => ({
    ext1: { a: [x, 0], b: [x, -3] },
    ext2: { a: [x + value, 0], b: [x + value, -3] },
    line: { a: [x, -2.5], b: [x + value, -2.5] },
    ticks: [{ a: [x, -2.5], b: [x, -2.5] }, { a: [x + value, -2.5], b: [x + value, -2.5] }],
    text: { x: x + value / 2, y: -3, angleDeg: 0, value },
    label,
  })

  test('of two figures on one spot the longer dimension stays, a labelled one always, in the order given', () => {
    const short = dim(5, 1)
    const long = dim(1, 12)
    const far = dim(40, 2)
    expect(clearFigures([short, long, far], 1, [])).toEqual([long, far])
    const overall = dim(5, 1, 'Overall')
    expect(clearFigures([long, overall], 1, [])).toEqual([overall])
  })

  test('a figure on a mark already there is left off', () => {
    const taken: Box = { x0: 5, y0: -4, x1: 9, y1: -2 }
    expect(clearFigures([dim(1, 12), dim(40, 2)], 1, [taken])).toEqual([dim(40, 2)])
  })

  test('on each plan at its Tabloid scale no figure lands on another, on the datum label or on an opening tag, and a note says some were left off', () => {
    for (const b of buildings()) {
      const scale = PLAN_SCALE[b.id]
      const pen = penSizes(scale)
      const layout = planLayout(b, scale)
      const texts = layout.dims.map((d) => dimText(d, d.label, pen.text))
      for (const [p, q] of pairs(texts)) expect(textsOverlap(p, q), `${b.name}: two figures on one spot`).toBe(false)
      const marks = [datumLabelBox(b.datum, pen.text, pen.small), ...openingTagBoxes(b, pen)].map(upright)
      for (const t of texts) expect(marks.some((m) => textsOverlap(t, m)), `${b.name}: a figure on a mark`).toBe(false)
      expect(layout.general?.lines.includes(OMITTED_NOTE)).toBe(layout.omitted > 0)
    }
  })

  test('turned figures side by side on parallel slanted lines do not count as overprinting, though their upright boxes cross', () => {
    const a: TurnedText = { at: [0, 0], halfW: 3, halfH: 0.5, angleDeg: 45 }
    const b: TurnedText = { at: [1.5, -1.5], halfW: 3, halfH: 0.5, angleDeg: 45 }
    expect(textsOverlap(a, b)).toBe(false)
    expect(textsOverlap(a, { ...b, at: [0.5, -0.5] })).toBe(true)
    expect(textsOverlap(a, { at: [2, 2], halfW: 0.2, halfH: 0.2, angleDeg: 0 })).toBe(true)
    expect(textsOverlap(a, { at: [2, -2], halfW: 0.2, halfH: 0.2, angleDeg: 0 })).toBe(false)
  })

  test("the prow at 1/16\" leaves figures off and says so; every overall size stays", () => {
    const prow = buildings().find((b) => b.id === 'C-0')!
    const layout = planLayout(prow, 0.0625)
    expect(layout.omitted).toBeGreaterThan(0)
    expect(layout.general?.lines).toContain(OMITTED_NOTE)
    expect(layout.dims.filter((d) => d.label).length).toBe(planLayout(prow, 0.5).dims.filter((d) => d.label).length)
  })
})

describe("the parts' names", () => {
  const part = (massIndex: number, name: string, x: number, w: number) => ({ massIndex, name, outline: [[x, 0], [x + w, 0], [x + w, 20], [x, 20]] as Pt[] })

  test('a name alone is at the centre of its part', () => {
    expect(partLabelSpots([part(0, 'Deck 1', 0, 20)], 1, [])).toEqual([{ massIndex: 0, at: [10, 10] }])
  })

  test('two parts stacked on one centre get their names on separate lines, the larger part keeping the centre', () => {
    const spots = partLabelSpots([part(0, 'Stair 2', 4, 12), part(1, 'Back porch', 0, 20)], 1, [])
    expect(spots[1].at).toEqual([10, 10])
    expect(spots[0].at[1]).not.toBeCloseTo(10, 6)
    expect(overlaps(partLabelBox('Stair 2', spots[0].at, 1), partLabelBox('Back porch', spots[1].at, 1))).toBe(false)
  })

  test('a name moves off a figure already at its centre, staying inside its part', () => {
    const [spot] = partLabelSpots([part(0, 'Deck 1', 0, 20)], 1, [{ x0: 8, y0: 9.6, x1: 12, y1: 10.4 }])
    expect(spot.at[0]).toBe(10)
    expect(Math.abs(spot.at[1] - 10)).toBeGreaterThan(0.9)
    expect(spot.at[1]).toBeGreaterThan(0)
    expect(spot.at[1]).toBeLessThan(20)
  })

  test("on the prow's plan at 1/16\" no two part names overprint", () => {
    const prow = buildings().find((b) => b.id === 'C-0')!
    const pen = penSizes(0.0625)
    const layout = planLayout(prow, 0.0625)
    const spots = partLabelSpots(prow.parts, pen.text, partLabelsTaken(prow, planFigures(prow, layout, pen), pen))
    const boxes = spots.map((s) => partLabelBox(prow.parts.find((p) => p.massIndex === s.massIndex)!.name, s.at, pen.text))
    for (const [p, q] of pairs(boxes)) expect(overlaps(p, q)).toBe(false)
  })
})

describe('the notes and the section cut marks', () => {
  /** The lowest point of the cut bubbles as SectionMarks draws them: a circle of 1.1 text heights just past each end of the line. */
  const lowestBubble = (b: SheetBuilding, scale: Scale): number => {
    const pen = penSizes(scale)
    const box = planBox(b, planLayout(b, scale))
    const r = pen.text * 1.1
    const past = r + pen.small * 0.4
    return Math.max(
      ...(sectionCuts(b) ?? []).flatMap((c) => {
        const reach = cutReachIn(c, box)
        if (!reach) return []
        return reach.map((u, i) => planAt(c, u)[1] + c.dir[1] * past * (i === 0 ? -1 : 1) + r)
      }),
    )
  }

  test('with the cuts marked, the first line of the notes starts below the lowest cut bubble, and the notes stay on the page', () => {
    for (const b of buildings()) {
      const scale = PLAN_SCALE[b.id]
      const pen = penSizes(scale)
      const pad = cutMarkPadFt(scale)
      const plain = planLayout(b, scale)
      const layout = notesBelowCuts(plain, pad)
      const notes = layout.general!
      expect(plain.general!.at[1] - pen.small, `${b.name}: the fault this cures`).toBeLessThan(lowestBubble(b, scale))
      expect(notes.at[1] - pen.small, b.name).toBeGreaterThan(lowestBubble(b, scale))
      const page = padExtent(layout.extent, pad)
      expect(notes.at[1] + pen.small * 1.2 * notes.lines.length).toBeLessThan(page.y + page.h)
      expect(layout.extent).toEqual(plain.extent)
    }
  })
})

describe('each plan still fits one Tabloid page', () => {
  test('the prow at 1/16", the cabins at 1/8", every floor, with the cut marks', () => {
    for (const b of buildings()) {
      const scale = PLAN_SCALE[b.id]
      for (const f of floorPlans(b)) {
        const e = padExtent(planLayout(f.building, scale, f.floor).extent, cutMarkPadFt(scale))
        expect(tileDrawing(e.w, e.h, 'tabloid', scale), `${b.name} ${e.w} × ${e.h} ft`).toHaveLength(1)
      }
    }
  })

  test('a cabin does not fit at the next scale up, so its scale has not changed', () => {
    for (const b of buildings().filter((x) => x.id !== 'C-0')) {
      const e = padExtent(planLayout(b, 0.25).extent, cutMarkPadFt(0.25))
      expect(tileDrawing(e.w, e.h, 'tabloid', 0.25).length, b.name).toBeGreaterThan(1)
    }
  })
})
