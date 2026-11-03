import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { buildingMasses } from '../buildings/masses'
import type { EdgeRail } from '../buildings/railRules'
import { loadIslandaleTerrain } from '../site/islandale'
import { loadSchemes, schemeById } from '../site/schemes'
import { planFromScheme } from '../store/fromLegacy'
import { usePlanStore } from '../store/planStore'
import { setRailDrawResolver } from '../store/railResolver'
import type { Plan, PlanObject } from '../store/types'
import { objectRails, planRailWorld, resolveRailDraws } from './railSite'
import { stairInfo } from './stairSite'

const terrain = loadIslandaleTerrain()
const objectsOf = (plan: Plan): PlanObject[] => plan.order.map((id) => plan.objects[id])
const schemePlan = (id: string) => planFromScheme(schemeById(loadSchemes(), id))

/** Per building, the masses and edges the scene draws a rail on: guards that keep a run, and stair and ramp handrails (sides 1 and 3). */
function railed(plan: Plan): Record<string, Record<number, number[]>> {
  const world = planRailWorld(objectsOf(plan), terrain)
  const out: Record<string, Record<number, number[]>> = {}
  for (const o of objectsOf(plan)) {
    if (o.type !== 'house') continue
    const rails = objectRails(world, o)
    buildingMasses(o.params).forEach((m, mi) => {
      const access = m.kind === 'stair' || m.kind === 'ramp'
      const handrails = (stairInfo(world, o, mi)?.rails ?? []).filter((r) => !r.skipped).map((r) => (r.side > 0 ? 1 : 3))
      const edges = access ? handrails.sort((a, b) => a - b) : (rails[mi] ?? []).filter((e) => e.runs.length).map((e) => e.i)
      if (edges.length) (out[o.id] ??= {})[mi] = edges
    })
  }
  return out
}

describe('Schemes C and C2–C4 rail where they did', () => {
  // the same table as e2e/paths-rails.spec.ts (LEGACY_RAILED), read from the old planner
  const LEGACY_RAILED = (id: string) => ({ [`${id}-0`]: [2, 3], [`${id}-1`]: [1, 2], [`${id}-2`]: [1, 2, 3], [`${id}-3`]: [1, 2, 3] })
  for (const id of ['C', 'C2', 'C3', 'C4']) {
    test(`${id}: the same masses carry rails`, () => {
      const byMass = railed(schemePlan(id))
      const masses = Object.fromEntries(Object.entries(byMass).map(([k, v]) => [k, Object.keys(v).map(Number)]))
      expect(masses).toEqual(LEGACY_RAILED(id))
    })
  }

  test('C rails these edges (what railedEdges() reports in the scene)', () => {
    expect(railed(schemePlan('C'))).toEqual({
      // the prow: its stair, and its curved deck except the sitting-step edges and where it runs along the walls
      'C-0': { 2: [1, 3], 3: [0, 1, 2, 15, 16, 32] },
      'C-1': { 1: [0, 1, 2, 3], 2: [1, 3] },
      'C-2': { 1: [1, 2, 3], 2: [1, 3], 3: [0, 1, 2, 3] },
      // the wedge deck keeps rail 'sides': its ends (edges 1 and 3) stay open
      'C-3': { 1: [1, 2, 3], 2: [1, 2, 3], 3: [0, 2] },
    })
  })

  test('the boardwalk and the doors open the prow deck where they meet it', () => {
    const plan = schemePlan('C')
    const deck = objectRails(planRailWorld(objectsOf(plan), terrain), plan.objects['C-0'])[3]!
    expect(deck[15].names).toContain('Elders’ walk · 1:21 boardwalk')
    expect(deck[15].runs).toHaveLength(2)
    expect(deck[17].names).toEqual(['Slider'])
  })
})

describe('the store keeps what is drawn on the first per-edge write', () => {
  const store = () => usePlanStore.getState()
  const runsOf = (id: string, mi: number): EdgeRail['runs'][] => {
    const plan = store().plan
    return objectRails(planRailWorld(objectsOf(plan), terrain), plan.objects[id])[mi]!.map((e) => e.runs)
  }
  beforeEach(() => {
    store().setReadOnly(null)
    store().loadScheme('C')
    store().lockAll(false)
    setRailDrawResolver(resolveRailDraws)
  })
  afterEach(() => setRailDrawResolver(null))

  for (const [id, mi, label] of [
    ['C-0', 3, 'the prow deck (rails on low edges)'],
    ['C-3', 3, "the wedge deck (rail 'sides')"],
    ['C-2', 1, 'a porch railed all round'],
  ] as const) {
    test(`switching one edge of ${label} off changes only that edge`, () => {
      const before = runsOf(id, mi)
      const edge = before.findIndex((r) => r.length > 0)
      store().setRail(id, mi, edge, 'off')
      const after = runsOf(id, mi)
      expect(after[edge]).toEqual([])
      expect(after.filter((_, i) => i !== edge)).toEqual(before.filter((_, i) => i !== edge))
    })
  }

  test("A-0's deck keeps the runs past the house on its covered edge 0 when another edge is switched off", () => {
    store().loadScheme('A')
    store().lockAll(false)
    const before = runsOf('A-0', 1)
    expect(before[0].length).toBeGreaterThan(0)
    const edge = objectRails(planRailWorld(objectsOf(store().plan), terrain), store().plan.objects['A-0'])[1]!.findIndex((e) => e.free && e.runs.length > 0)
    store().setRail('A-0', 1, edge, 'off')
    const after = runsOf('A-0', 1)
    expect(after[edge]).toEqual([])
    expect(after.filter((_, i) => i !== edge)).toEqual(before.filter((_, i) => i !== edge))
  })

  test('in every scheme the first per-edge write leaves every other edge as drawn, covered edges included', () => {
    for (const scheme of loadSchemes()) {
      store().loadScheme(scheme.id)
      store().lockAll(false)
      const start = store().plan
      for (const id of start.order) {
        const o = start.objects[id]
        if (o.type !== 'house' && o.type !== 'deck') continue
        objectRails(planRailWorld(objectsOf(start), terrain), o).forEach((edges, mi) => {
          const edge = edges?.findIndex((e) => e.free && e.runs.length > 0) ?? -1
          if (edge < 0) return
          const before = runsOf(id, mi)
          store().setRail(id, mi, edge, 'off')
          const after = runsOf(id, mi)
          expect(after.filter((_, i) => i !== edge), `${id} mass ${mi}`).toEqual(before.filter((_, i) => i !== edge))
          usePlanStore.temporal.getState().undo()
        })
      }
    }
  })

  test('the resolver answers for a deck or porch and not for a stair', () => {
    const q = { plan: store().plan, site: store().site, id: 'C-0' }
    expect(resolveRailDraws({ ...q, mass: 3 })).toHaveLength(33)
    expect(resolveRailDraws({ ...q, mass: 2 })).toBeNull()
    expect(resolveRailDraws({ ...q, id: 'nope', mass: 0 })).toBeNull()
  })
})

describe('standalone decks', () => {
  test('a ring deck 1.5 ft up gets no guard by the legacy rule, and one where forced on', () => {
    const plan = schemePlan('E')
    const ring = objectsOf(plan).filter((o) => o.type === 'deck')
    expect(ring.length).toBeGreaterThan(0)
    const world = planRailWorld(objectsOf(plan), terrain)
    const low = ring.find((o) => objectRails(world, o)[0]!.every((e) => !e.drawn))!
    expect(low).toBeDefined()
    const forced = { ...low, params: { ...low.params, rail: true } }
    expect(objectRails(world, forced)[0]!.every((e) => e.drawn && e.free)).toBe(true)
  })
})
