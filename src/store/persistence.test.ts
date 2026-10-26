import { describe, expect, test } from 'vitest'
import { usePlanStore } from './planStore'
import { parsePlanFile, serializePlan, validatePlan } from './persistence'
import { DEFAULT_LAYERS } from './types'

describe('plan files', () => {
  const view = { labelMode: 'selected' as const, layers: { ...DEFAULT_LAYERS, trees: { visible: false, locked: true } } }

  test('a plan round-trips through the JSON file format', () => {
    const plan = usePlanStore.getState().plan
    const file = parsePlanFile(serializePlan(plan, view))
    expect(file.plan).toEqual(plan)
    expect(file.view).toEqual(view)
    expect(file.version).toBe(1)
  })

  test('rejects files that are not plans', () => {
    expect(() => parsePlanFile('not json')).toThrow(/JSON/)
    expect(() => parsePlanFile('{"version":1}')).toThrow(/Plan is missing/)
    expect(() => parsePlanFile('{"version":2,"plan":{}}')).toThrow(/version/)
    expect(() => validatePlan({ siteId: 'elsewhere', objects: {}, order: [] })).toThrow(/Islandale/)
  })

  test('fills in missing optional fields and drops unknown ids from the order', () => {
    const plan = validatePlan({
      siteId: 'islandale',
      objects: { a: { type: 'pad', position: { x: 1, n: 2 } } },
      order: ['ghost', 'a'],
    })
    expect(plan.order).toEqual(['a'])
    expect(plan.objects.a).toMatchObject({ name: 'pad', rotation: 0, locked: false, hidden: false, labelVisible: true })
  })
})
