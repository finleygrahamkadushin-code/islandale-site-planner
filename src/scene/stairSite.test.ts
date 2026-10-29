import { describe, expect, test } from 'vitest'
import { loadIslandaleTerrain } from '../site/islandale'
import { loadSchemes, schemeById } from '../site/schemes'
import { planFromScheme } from '../store/fromLegacy'
import type { PlanObject } from '../store/types'
import { planRailWorld } from './railSite'
import { stairInfo } from './stairSite'

const terrain = loadIslandaleTerrain()
const scheme = (id: string) => {
  const plan = planFromScheme(schemeById(loadSchemes(), id))
  const objects = plan.order.map((k) => plan.objects[k]).filter((o): o is PlanObject => !!o)
  return { plan, world: planRailWorld(objects, terrain) }
}

describe('stairInfo (the part inspector numbers)', () => {
  for (const id of ['C', 'C2', 'C3', 'C4']) {
    test(`${id}: every stair keeps handrails on both sides, as e2e/paths-rails.spec.ts expects`, () => {
      const { plan, world } = scheme(id)
      for (const [oid, mi] of [[`${id}-0`, 2], [`${id}-1`, 2], [`${id}-2`, 2]] as const) {
        const info = stairInfo(world, plan.objects[oid], mi)!
        expect(info.n, oid).toBeGreaterThan(1)
        expect(info.rails.map((r) => [r.side, r.skipped]), oid).toEqual([
          [-1, false],
          [1, false],
        ])
      }
    })
  }

  test("C's prow stair: two risers on its fixed 5 ft run meet 7 in / 11 in; the lantern's 4 ft stair is short", () => {
    const { plan, world } = scheme('C')
    const prow = stairInfo(world, plan.objects['C-0'], 2)!
    expect(prow.n).toBe(2)
    expect(prow.ok).toBe(true)
    const lantern = stairInfo(world, plan.objects['C-1'], 2)!
    expect(lantern.ok).toBe(false)
    expect(lantern.tread).toBeCloseTo((4 * 0.3048) / lantern.n)
  })

  test("G-0's rear stair lands in front of a door, so its handrails start back from it", () => {
    const { plan, world } = scheme('G')
    const info = stairInfo(world, plan.objects['G-0'], 3)!
    expect(info.clearTop).toBe(true)
    expect(info.rails[0].za).toBeGreaterThan(info.topNosingZ + 0.29)
  })

  test("A's elders' ramp reports its slope and is steeper than 1:12", () => {
    const { plan, world } = scheme('A')
    const info = stairInfo(world, plan.objects['A-2'], 2)!
    expect(info.kind).toBe('ramp')
    expect(info.slope).toBeGreaterThan(1 / 12)
    expect(info.steep).toBe(true)
    expect(info.rails.every((r) => !r.skipped)).toBe(true)
  })

  test('not a stair or ramp: null', () => {
    const { plan, world } = scheme('C')
    expect(stairInfo(world, plan.objects['C-0'], 0)).toBeNull()
    expect(stairInfo(world, plan.objects['C-0'], 3)).toBeNull()
    expect(stairInfo(world, plan.objects['C-0'], 99)).toBeNull()
  })
})
