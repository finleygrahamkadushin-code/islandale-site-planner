import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { buildingMasses } from '../masses'
import type { EdgeRail } from './railRules'
import { loadIslandaleTerrain } from '../../site/islandale'
import { loadSchemes, schemeById } from '../../site/schemes'
import { planFromScheme, planObjectFromLegacy } from '../../store/fromLegacy'
import { usePlanStore } from '../../store/planStore'
import { setRailDrawResolver } from '../../store/railResolver'
import type { Plan, PlanObject } from '../../store/types'
import { objectRails, planRailWorld, resolveRailDraws } from './railSite'
import { stairInfo } from '../stairs/stairSite'

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

describe('Scheme C rails where it did', () => {
  // the same table as e2e/paths-rails.spec.ts (LEGACY_RAILED), read from the old planner
  // the prow's front stair runs into rising ground, so its handrails stop with its treads (PLAN.md, stairs into the ground)
  const LEGACY_RAILED = { 'C-0': [3], 'C-1': [1, 2], 'C-2': [1, 2, 3], 'C-3': [1, 2, 3] }
  test('C: the same masses carry rails', () => {
    const byMass = railed(schemePlan('C'))
    const masses = Object.fromEntries(Object.entries(byMass).map(([k, v]) => [k, Object.keys(v).map(Number)]))
    expect(masses).toEqual(LEGACY_RAILED)
  })

  test('C rails these edges (what railedEdges() reports in the scene)', () => {
    expect(railed(schemePlan('C'))).toEqual({
      // the prow: its curved deck (its stair runs into the ground) except the sitting-step edges and where it runs along the walls
      'C-0': { 3: [0, 1, 2, 15, 16, 32] },
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

  test("C-1's porch keeps the runs past the house on its covered edge 0 when another edge is switched off", () => {
    const before = runsOf('C-1', 1)
    expect(before[0].length).toBeGreaterThan(0)
    const edge = objectRails(planRailWorld(objectsOf(store().plan), terrain), store().plan.objects['C-1'])[1]!.findIndex((e) => e.free && e.runs.length > 0)
    store().setRail('C-1', 1, edge, 'off')
    const after = runsOf('C-1', 1)
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

  test("removing one handrail of C's lantern stair keeps the other; undo brings it back", () => {
    const info = () => stairInfo(planRailWorld(objectsOf(store().plan), terrain), store().plan.objects['C-1'], 2)!
    expect(info().rails.map((r) => r.side)).toEqual([-1, 1])
    store().setRail('C-1', 2, 1, 'off')
    expect(info().rails.map((r) => r.side)).toEqual([-1])
    store().setRail('C-1', 2, 3, 'off')
    expect(info().rails).toEqual([])
    store().setRail('C-1', 2, 1, 'on')
    expect(info().rails.map((r) => r.side)).toEqual([1])
    usePlanStore.temporal.getState().undo()
    usePlanStore.temporal.getState().undo()
    usePlanStore.temporal.getState().undo()
    expect(info().rails.map((r) => r.side)).toEqual([-1, 1])
  })

  test("C's lantern stair handrails join the porch railing at their top by default; Join off stops one", () => {
    const info = () => stairInfo(planRailWorld(objectsOf(store().plan), terrain), store().plan.objects['C-1'], 2)!
    expect(info().rails.map((r) => r.joined)).toEqual([true, true])
    store().setRailJoin('C-1', 2, 3, false)
    expect(info().rails.map((r) => r.joined)).toEqual([false, true])
    store().setRailJoin('C-1', 2, 3, true)
    expect(info().rails.map((r) => r.joined)).toEqual([true, true])
  })

  test('a locked cabin refuses a stair handrail or Join change', () => {
    store().setLocked('C-1', true)
    const before = store().plan
    store().setRail('C-1', 2, 1, 'off')
    store().setRailJoin('C-1', 2, 1, false)
    expect(store().plan).toBe(before)
  })

  test('the resolver answers for a deck or porch and not for a stair', () => {
    const q = { plan: store().plan, site: store().site, id: 'C-0' }
    expect(resolveRailDraws({ ...q, mass: 3 })).toHaveLength(33)
    expect(resolveRailDraws({ ...q, mass: 2 })).toBeNull()
    expect(resolveRailDraws({ ...q, id: 'nope', mass: 0 })).toBeNull()
  })
})

describe('standalone decks', () => {
  test('a deck 1.5 ft up gets no guard by the legacy rule, and one where forced on', () => {
    const low = planObjectFromLegacy('low', { t: 'deck', name: 'Low deck', w: 13.6, d: 5, h: 1.5, lift: 0, support: 'posts', rot: 330, x: -7.8, n: -15.12 })
    const world = planRailWorld([...objectsOf(schemePlan('C')), low], terrain)
    expect(objectRails(world, low)[0]!.every((e) => !e.drawn)).toBe(true)
    const forced = { ...low, params: { ...low.params, rail: true } }
    expect(objectRails(world, forced)[0]!.every((e) => e.drawn && e.free)).toBe(true)
  })
})
