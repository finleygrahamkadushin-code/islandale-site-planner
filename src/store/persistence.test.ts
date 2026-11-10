import { describe, expect, test } from 'vitest'
import { usePlanStore } from './planStore'
import { describeSkipped, parsePlanFile, readPlanFileText, readSavedText, serializePlan, validatePlan } from './persistence'
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

describe('one bad object (R6.5, R6.6, R6.7)', () => {
  const good = { type: 'pad', name: 'Pad', position: { x: 1, n: 2 }, params: { w: 10, d: 12 } }
  const fileWith = (objects: Record<string, unknown>, order: unknown[] = Object.keys(objects)) =>
    JSON.stringify({ version: 1, plan: { siteId: 'islandale', name: 'P', objects, order }, view: {} })

  test('a malformed object is skipped and named; every other object opens', () => {
    const r = readPlanFileText(fileWith({ a: good, broken: { type: 'house', name: 'Gathering prow' }, b: good }))
    expect(r.file.plan.order).toEqual(['a', 'b'])
    expect(Object.keys(r.file.plan.objects)).toEqual(['a', 'b'])
    expect(r.skipped).toEqual([{ id: 'broken', name: 'Gathering prow', reason: 'it has no position' }])
    expect(describeSkipped(r.skipped)).toMatch(/Gathering prow/)
  })

  test('the saved-text reader skips too, so autosave and the plan home keep the rest', () => {
    const r = readSavedText(fileWith({ a: good, x: 'not an object' }))
    expect(Object.keys(r.file.plan.objects)).toEqual(['a'])
    expect(r.skipped.map((s) => s.id)).toEqual(['x'])
  })

  test('sizes must be above zero and numbers finite; params must be an object', () => {
    const r = readPlanFileText(
      fileWith({
        a: good,
        zeroW: { ...good, params: { w: 0, d: 10 } },
        textD: { ...good, params: { w: 10, d: '12' } },
        badH: { ...good, params: { h: null } },
        badParams: { ...good, params: [1, 2] },
        badWings: { ...good, params: { wings: 'east' } },
        noType: { ...good, type: '' },
      }),
    )
    expect(Object.keys(r.file.plan.objects)).toEqual(['a'])
    expect(r.skipped.map((s) => s.id)).toEqual(['zeroW', 'textD', 'badH', 'badParams', 'badWings', 'noType'])
  })

  test('the draw order keeps only own object ids, once each (R6.7)', () => {
    const plan = validatePlan({ siteId: 'islandale', objects: { a: good }, order: ['constructor', 'toString', 'a', 'a', '__proto__'] })
    expect(plan.order).toEqual(['a'])
  })

  test('an object id that would rewrite the prototype is skipped', () => {
    const text = `{"version":1,"view":{},"plan":{"siteId":"islandale","order":["a"],"objects":{"a":${JSON.stringify(good)},"__proto__":${JSON.stringify(good)}}}}`
    const r = readPlanFileText(text)
    expect(Object.keys(r.file.plan.objects)).toEqual(['a'])
    expect(Object.getPrototypeOf(r.file.plan.objects)).toBe(Object.prototype)
    expect(r.skipped.map((s) => s.id)).toEqual(['__proto__'])
  })

  test('a whole-plan fault still refuses the file', () => {
    expect(() => readPlanFileText('{"version":1,"plan":{"siteId":"islandale","objects":[],"order":[]}}')).toThrow(/no objects/)
  })
})

test('every scheme reads back with nothing left out', () => {
  const s = usePlanStore.getState()
  for (const scheme of s.schemes) {
    s.loadScheme(scheme.id)
    const r = readPlanFileText(serializePlan(usePlanStore.getState().plan, { labelMode: 'all', layers: DEFAULT_LAYERS }))
    expect(r.skipped, scheme.id).toEqual([])
  }
  s.loadScheme('C')
})
