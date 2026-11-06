import { describe, expect, test } from 'vitest'
import { usePlanStore } from './planStore'
import { parsePlanFile, serializePlan, validatePlan } from './persistence'
import { DEFAULT_LAYERS } from './types'

describe('plan files', () => {
  const view = {
    labelMode: 'selected' as const,
    layers: { ...DEFAULT_LAYERS, trees: { visible: false, locked: true } },
    environment: { season: 'dec' as const, hour: 9.5, tideFt: 3 },
    setbacks: { shoreFt: 50, bankFt: 40, sideFt: 12, treeZones: false, shown: true },
    displayStyle: 'white' as const,
    contours: true,
    displayOptions: { shadows: false },
  }

  test('a plan round-trips through the JSON file format', () => {
    const plan = usePlanStore.getState().plan
    const file = parsePlanFile(serializePlan(plan, view))
    expect(file.plan).toEqual(plan)
    expect(file.view).toEqual(view)
    expect(file.version).toBe(1)
  })

  test('a plan saved before 5E loads with the default setbacks', () => {
    const plan = usePlanStore.getState().plan
    const { setbacks: _drop, ...old } = view
    const file = parsePlanFile(serializePlan(plan, old))
    expect(file.view.setbacks).toEqual({ shoreFt: 35, bankFt: 45, sideFt: 10, treeZones: true, shown: true })
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

describe('older plan files', () => {
  test('a file without environment or display style gets the defaults', () => {
    const plan = usePlanStore.getState().plan
    const text = JSON.stringify({ version: 1, plan, view: { labelMode: 'all', layers: DEFAULT_LAYERS } })
    const file = parsePlanFile(text)
    expect(file.view.displayStyle).toBe('realistic')
    expect(file.view.environment).toEqual({ season: 'sep', hour: 14, tideFt: 6.2 })
  })
})

