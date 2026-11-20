import { beforeAll, describe, expect, test } from 'vitest'
import planFile from '../../../../data/plans/islandale.default.json'
import { formatArch } from '../format'
import { elevationView, sheetBuildings } from '../model/model'
import { penSizes } from '../plan/planLayout'
import { textWidthFt, type DimLine, type Segment } from '../svgDims'
import { tileDrawing } from '../tiles'
import type { ElevationView, Scale, SheetBuilding } from '../types'
import { usePlanStore } from '../../../store/planStore'
import type { Plan, PlanObject } from '../../../store/types'
import { elevationLayout, surveyDiffers } from './ElevationSheet'
import { SIDES } from './sides'

const store = () => usePlanStore.getState()
const objects = (): PlanObject[] => store().plan.order.map((id) => store().plan.objects[id])
const buildings = (): SheetBuilding[] => sheetBuildings(objects(), store().site.terrain)
const named = (name: string): SheetBuilding => {
  const b = buildings().find((x) => x.id === name)
  if (!b) throw new Error(`no ${name}`)
  return b
}
const viewsOf = (b: SheetBuilding): ElevationView[] => SIDES.map((side) => elevationView(objects(), store().site.terrain, b, side))

/** The scale each building's elevations open at on Tabloid, on the default plan: the prow, the lantern, the twin pod, the wedge. */
const FIT: readonly (readonly [string, Scale])[] = [
  ['C-0', 0.09375],
  ['C-1', 0.25],
  ['C-2', 0.125],
  ['C-3', 0.25],
]
const SMALLEST: Scale = 0.0625

interface Box {
  readonly x0: number
  readonly x1: number
  readonly y0: number
  readonly y1: number
}

/** The paper a dimension's text covers: as long as its words, one text height across, turned with the line. */
function textBox(d: DimLine, textFt: number): Box {
  const along = textWidthFt(formatArch(d.text.value), textFt) / 2
  const across = textFt / 2
  const upright = Math.abs(d.text.angleDeg) > 45
  const [hx, hy] = upright ? [across, along] : [along, across]
  return { x0: d.text.x - hx, x1: d.text.x + hx, y0: d.text.y - hy, y1: d.text.y + hy }
}

const overlap = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
/** Whether an axis-aligned line runs through a box. */
const crosses = (s: Segment, b: Box): boolean =>
  overlap({ x0: Math.min(s.a[0], s.b[0]) - 1e-6, x1: Math.max(s.a[0], s.b[0]) + 1e-6, y0: Math.min(s.a[1], s.b[1]) - 1e-6, y1: Math.max(s.a[1], s.b[1]) + 1e-6 }, b)

/** Every (building, side, scale) the sheets print by default, and each again at the smallest scale. */
function cases(): { name: string; b: SheetBuilding; view: ElevationView; scale: Scale }[] {
  return FIT.flatMap(([name, fit]) => {
    const b = named(name)
    return viewsOf(b).flatMap((view) => [fit, SMALLEST].map((scale) => ({ name: `${name} ${view.side} at ${scale}`, b, view, scale })))
  })
}

beforeAll(() => {
  store().setReadOnly(null)
  store().loadScheme('C')
  store().replacePlan(planFile.plan as unknown as Plan)
})

describe('elevationLayout', () => {
  test('no dimension text prints on another, at the fitted scale or the smallest', () => {
    const clashes = cases().flatMap(({ name, b, view, scale }) => {
      const boxes = elevationLayout(b, view, undefined, scale).dims.map((d) => textBox(d, penSizes(scale).text))
      return boxes.flatMap((a, i) => boxes.slice(i + 1).filter((c) => overlap(a, c)).map(() => name))
    })
    expect(clashes).toEqual([])
  })

  test("no dimension line runs through another dimension's text", () => {
    const clashes = cases().flatMap(({ name, b, view, scale }) => {
      const dims = elevationLayout(b, view, undefined, scale).dims
      return dims.flatMap((d, i) => dims.filter((o, j) => j !== i && crosses(o.line, textBox(d, penSizes(scale).text))).map(() => name))
    })
    expect(clashes).toEqual([])
  })

  test("no extension line runs through another dimension's text at the fitted scales", () => {
    const clashes = cases()
      .filter(({ scale }) => scale !== SMALLEST)
      .flatMap(({ name, b, view, scale }) => {
        const dims = elevationLayout(b, view, undefined, scale).dims
        return dims.flatMap((d, i) => dims.filter((o, j) => j !== i && [o.ext1, o.ext2].some((e) => crosses(e, textBox(d, penSizes(scale).text)))).map((o) => `${name}: ${formatArch(o.text.value)} through ${formatArch(d.text.value)}`))
      })
    expect(clashes).toEqual([])
  })

  test('the overall height stands outside every stepped-out height', () => {
    for (const { b, view, scale } of cases()) {
      const heights = elevationLayout(b, view, undefined, scale).dims.filter((d) => Math.abs(d.text.angleDeg) > 45)
      const overall = heights[heights.length - 1]
      const chain = heights.slice(0, -1)
      const outer = Math.min(...chain.map((d) => d.text.x - penSizes(scale).text / 2))
      expect(overall.line.a[0]).toBeLessThan(outer)
    }
  })

  test('no width is given twice over the same span', () => {
    for (const { name, b, view, scale } of cases()) {
      const widths = elevationLayout(b, view, undefined, scale).dims.filter((d) => Math.abs(d.text.angleDeg) <= 45)
      const spans = widths.map((d) => `${d.line.a[0].toFixed(2)} ${d.line.b[0].toFixed(2)}`)
      expect(new Set(spans).size, name).toBe(spans.length)
    }
  })

  test('the gaps between dimension rows are paper sizes: the same on the page at every scale', () => {
    const b = named('C-3')
    const view = viewsOf(b)[0]
    const rowsIn = (scale: Scale) => {
      const widths = elevationLayout(b, view, undefined, scale).dims.filter((d) => Math.abs(d.text.angleDeg) <= 45)
      const ys = [...new Set(widths.map((d) => Math.round(d.line.a[1] * scale * 7200) / 100))].sort((a, c) => a - c)
      return ys.slice(1).map((y, i) => Math.round(y - ys[i]))
    }
    expect(rowsIn(0.25).length).toBeGreaterThan(0)
    expect(rowsIn(0.0625).slice(0, 1)).toEqual(rowsIn(0.25).slice(0, 1))
  })

  test('the surveyed grade is named in the ground, under every line, clear of the level labels and the dimensions', () => {
    const shown = cases().filter(({ view }) => surveyDiffers(view))
    expect(shown.length).toBeGreaterThan(0)
    for (const { name, b, view, scale } of shown) {
      const layout = elevationLayout(b, view, undefined, scale)
      const pen = penSizes(scale)
      const label = layout.surveyLabel
      expect(label, name).not.toBeNull()
      if (!label) continue
      const half = textWidthFt(label.text, pen.small) / 2
      const box: Box = { x0: label.x - half, x1: label.x + half, y0: label.y - pen.small / 2, y1: label.y + pen.small / 2 }
      const lowest = Math.max(...[...view.grade, ...view.survey].map(([, y]) => -y), ...view.levels.map((l) => -l.yFt))
      expect(box.x1, name).toBeLessThanOrEqual(view.uMax + 1e-6)
      expect(box.x0, name).toBeGreaterThanOrEqual(view.uMin - 1e-6)
      expect(box.y0, name).toBeGreaterThan(lowest)
      expect(box.y1, name).toBeLessThanOrEqual(layout.groundBottom)
      const lines = layout.dims.flatMap((d) => [d.line, d.ext1, d.ext2])
      expect(lines.filter((s) => crosses(s, box)), name).toEqual([])
      expect(layout.dims.filter((d) => overlap(textBox(d, pen.text), box)), name).toEqual([])
    }
  })

  test('no survey label where the earthworks leave the ground alone', () => {
    const still = cases().find(({ view }) => !surveyDiffers(view))
    expect(still).toBeDefined()
    if (still) expect(elevationLayout(still.b, still.view, undefined, still.scale).surveyLabel).toBeNull()
  })

  test('every elevation still fits one Tabloid page at its fitted scale', () => {
    for (const [name, scale] of FIT) {
      const b = named(name)
      for (const view of viewsOf(b)) {
        const e = elevationLayout(b, view, undefined, scale).extent
        expect(tileDrawing(e.w, e.h, 'tabloid', scale), `${name} ${view.side}`).toHaveLength(1)
      }
    }
  })
})
