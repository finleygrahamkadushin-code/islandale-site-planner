import { describe, expect, test } from 'vitest'
import { sheetBuildings } from './model/model'
import type { Scale, SheetBuilding } from './types'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { largestScaleThatFits, tileDrawing } from './tiles'
import { floorPlans } from './plan/floorPlans'
import { planLayout } from './plan/planLayout'
import { CLEAN_MARGIN_IN, cleanPlanExtent } from './clean'

const SCALES: readonly Scale[] = [0.0625, 0.09375, 0.125, 0.25, 0.5]
const store = () => usePlanStore.getState()
const objects = (): PlanObject[] => store().plan.order.map((id) => store().plan.objects[id])
const buildings = (): SheetBuilding[] => sheetBuildings(objects(), store().site.terrain)

const cleanScale = (b: SheetBuilding): Scale => largestScaleThatFits(SCALES, 'tabloid', (s) => [cleanPlanExtent(b, s)])
const dimensionedScale = (b: SheetBuilding): Scale => largestScaleThatFits(SCALES, 'tabloid', (s) => floorPlans(b).map((f) => planLayout(f.building, s, f.floor).extent))

describe('clean copies', () => {
  test('a clean plan holds the whole building with the same clear paper round it at every scale', () => {
    for (const b of buildings()) {
      for (const scale of SCALES) {
        const e = cleanPlanExtent(b, scale)

        expect((b.bounds.minx - e.x) * scale).toBeCloseTo(CLEAN_MARGIN_IN, 6)
        expect((e.x + e.w - b.bounds.maxx) * scale).toBeCloseTo(CLEAN_MARGIN_IN, 6)
        expect((b.bounds.minz - e.y) * scale).toBeCloseTo(CLEAN_MARGIN_IN, 6)
        expect((e.y + e.h - b.bounds.maxz) * scale).toBeCloseTo(CLEAN_MARGIN_IN, 6)
      }
    }
  })

  test('every clean plan fits one Tabloid page at its own scale, never smaller than the dimensioned plan', () => {
    const all = buildings()
    expect(all.length).toBeGreaterThan(0)
    for (const b of all) {
      const scale = cleanScale(b)
      const e = cleanPlanExtent(b, scale)

      expect(tileDrawing(e.w, e.h, 'tabloid', scale)).toHaveLength(1)
      expect(scale).toBeGreaterThanOrEqual(dimensionedScale(b))
    }
  })

  test('with no dimensions to hold, at least one clean plan prints larger than its dimensioned plan', () => {
    const larger = buildings().filter((b) => cleanScale(b) > dimensionedScale(b))

    expect(larger.length).toBeGreaterThan(0)
  })
})
