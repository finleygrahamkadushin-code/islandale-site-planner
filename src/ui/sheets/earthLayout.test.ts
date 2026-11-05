import { beforeAll, describe, expect, test } from 'vitest'
import { elevationView, sheetBuildings } from '../../export/sheets/model'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { earthNotes, earthPlan } from './earthLayout'
import { surveyDiffers } from './ElevationSheet'
import { penSizes, planLayout } from './planLayout'

const store = () => usePlanStore.getState()
const objects = (): PlanObject[] => store().plan.order.map((id) => store().plan.objects[id])
const sheet = (id: string) => {
  const b = sheetBuildings(objects(), store().site.terrain).find((x) => x.id === id)
  if (!b) throw new Error(`no ${id}`)
  return b
}
const pen = penSizes(0.25)

beforeAll(() => {
  store().setReadOnly(null)
  store().loadScheme('C')
})

describe('earthPlan', () => {
  test("the sunk prow's retaining wall is one closed band, tagged with its length and given a spot height at each end", () => {
    const b = sheet('C-0')
    const plan = earthPlan(b, pen)
    const w = b.earthworks?.walls[0]
    expect(plan?.walls).toHaveLength(1)
    expect(plan?.walls[0]).toHaveLength((w?.face.length ?? 0) * 2)
    const lines = plan?.labels.flatMap((l) => l.lines) ?? []
    expect(lines).toContain(`RW1 stone retaining wall 38'-6"`)
    expect(lines.filter((l) => l.startsWith('TW '))).toHaveLength(2)
    expect(lines.some((l) => l.includes('SUNKEN COURT'))).toBe(true)
  })

  test('the drawing reaches round every earthworks mark and label, and the notes say what they are', () => {
    const b = sheet('C-0')
    const layout = planLayout(b, 0.25)
    const { x, y, w, h } = layout.extent
    for (const [px, pz] of layout.earth?.points ?? []) {
      expect(px).toBeGreaterThanOrEqual(x)
      expect(px).toBeLessThanOrEqual(x + w)
      expect(pz).toBeGreaterThanOrEqual(y)
      expect(pz).toBeLessThanOrEqual(y + h)
    }
    const notes = layout.general?.lines ?? []
    expect(notes).toEqual(expect.arrayContaining(earthNotes(b)))
    expect(notes.some((l) => l.startsWith('RW: retaining wall'))).toBe(true)
  })

  test('a cabin that leaves the ground alone has no earthworks marks or notes', () => {
    const b = sheet('C-1')
    expect(earthPlan(b, pen)).toBeNull()
    expect(earthNotes(b)).toEqual([])
    expect(planLayout(b, 0.25).earth).toBeNull()
  })
})

describe('surveyDiffers', () => {
  test("the prow's back elevation draws the survey over its cut; a cabin on posts does not", () => {
    const back = elevationView(objects(), store().site.terrain, sheet('C-0'), 'back')
    expect(surveyDiffers(back)).toBe(true)
    expect(surveyDiffers(elevationView(objects(), store().site.terrain, sheet('C-1'), 'front'))).toBe(false)
  })
})
