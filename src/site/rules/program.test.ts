import { describe, expect, test } from 'vitest'
import { planFromScheme } from '../../store/fromLegacy'
import type { PlanObject } from '../../store/types'
import { loadSchemes, schemeById } from '../schemes'
import { BUILDING_CAP_SQFT, PROGRAM_CAP_SQFT, buildingProgram, programBudget } from './program'

const WINGS = [
  { kind: 'wall', w: 10, d: 10, dx: 15, dz: 0 },
  { kind: 'porch', w: 8, d: 6, dx: 0, dz: 13 },
  { kind: 'deck', w: 12, d: 8, dx: -16, dz: 0 },
  { kind: 'stair', w: 4, d: 6, dx: 0, dz: -13 },
]

const cabin = (id: string, params: Record<string, unknown>): PlanObject => ({
  id,
  type: 'house',
  name: id,
  position: { x: 0, n: 0 },
  rotation: 0,
  params: { h: 9, ...params },
  locked: false,
  hidden: false,
  labelVisible: true,
})

const box = (id: string, side: number) => cabin(id, { w: side, d: side })

describe('program budget (5E)', () => {
  test('enclosed is the main walls plus closed wings; porches are covered; decks apart; stairs left out', () => {
    const b = buildingProgram(cabin('A', { w: 20, d: 20, wings: WINGS }))
    expect(b).toMatchObject({ floors: 1, enclosedSqFt: 500, coveredSqFt: 48, deckSqFt: 96, over: false })
  })

  test('an upper floor doubles the main mass, not the wings', () => {
    const b = buildingProgram(cabin('A', { w: 20, d: 20, wings: WINGS, floors: [{}, {}] }))
    expect(b).toMatchObject({ floors: 2, enclosedSqFt: 900, coveredSqFt: 48, deckSqFt: 96 })
  })

  test('rounds each building to whole square feet', () => {
    expect(buildingProgram(cabin('A', { w: 10.3, d: 10 })).enclosedSqFt).toBe(103)
  })

  test('a building flags only past 800 sq ft', () => {
    const atCap = programBudget([cabin('At', { w: 40, d: 20 })])
    expect(atCap.buildings[0].enclosedSqFt).toBe(BUILDING_CAP_SQFT)
    expect(atCap.overBuildings).toEqual([])
    expect(programBudget([cabin('Over', { w: 40.1, d: 20 })]).overBuildings).toEqual(['Over'])
  })

  test('the total flags only past 1,600 sq ft', () => {
    const atCap = programBudget([box('A', 20), box('B', 20), box('C', 20), box('D', 20)])
    expect(atCap.enclosedSqFt).toBe(PROGRAM_CAP_SQFT)
    expect(atCap.overTotal).toBe(false)
    const over = programBudget([box('A', 20), box('B', 20), box('C', 20), cabin('D', { w: 20, d: 20.1 })])
    expect(over.overTotal).toBe(true)
    expect(over.overBuildings).toEqual([])
  })

  test('hidden cabins and other objects are left out', () => {
    const tree: PlanObject = { ...box('T', 20), type: 'tree' }
    const hidden: PlanObject = { ...box('H', 20), hidden: true }
    expect(programBudget([box('A', 20), tree, hidden]).enclosedSqFt).toBe(400)
  })

  test('Scheme C gives plausible positive totals', () => {
    const plan = planFromScheme(schemeById(loadSchemes(), 'C'))
    const budget = programBudget(plan.order.map((id) => plan.objects[id]))
    expect(budget.buildings.length).toBeGreaterThan(0)
    expect(budget.enclosedSqFt).toBeGreaterThan(200)
    expect(budget.enclosedSqFt).toBeLessThan(5000)
    expect(budget.coveredSqFt + budget.deckSqFt).toBeGreaterThan(0)
    expect(budget.enclosedSqFt).toBe(budget.buildings.reduce((s, b) => s + b.enclosedSqFt, 0))
  })
})
