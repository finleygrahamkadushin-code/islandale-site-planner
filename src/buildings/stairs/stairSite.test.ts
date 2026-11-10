import { describe, expect, test } from 'vitest'
import { loadIslandaleTerrain } from '../../site/islandale'
import { loadSchemes, schemeById } from '../../site/schemes'
import { planFromScheme } from '../../store/fromLegacy'
import type { PlanObject } from '../../store/types'
import { planRailWorld } from '../rails/railSite'
import { withWing } from '../parts/wingEdits'
import { fitStairRun, stairAttached, stairInfo } from './stairSite'
import { snapToHost, stairAxis } from './stairWing'
import { buildingMasses } from '../masses'

const terrain = loadIslandaleTerrain()
const scheme = (id: string) => {
  const plan = planFromScheme(schemeById(loadSchemes(), id))
  const objects = plan.order.map((k) => plan.objects[k]).filter((o): o is PlanObject => !!o)
  return { plan, world: planRailWorld(objects, terrain) }
}

describe('stairInfo (the part inspector numbers)', () => {
  for (const id of ['C', 'C2', 'C3', 'C4']) {
    test(`${id}: the lantern and twin pod stairs keep handrails on both sides; the prow's runs into the ground`, () => {
      const { plan, world } = scheme(id)
      const prow = stairInfo(world, plan.objects[`${id}-0`], 2)!
      expect(prow.footAbove).toBe(true)
      expect(prow.buried).toBeGreaterThan(0)
      expect(prow.rails.every((r) => r.skipped)).toBe(true)
      for (const [oid, mi] of [[`${id}-1`, 2], [`${id}-2`, 2]] as const) {
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

/** The cabin with wing mi (mass index) patched. */
const patched = (o: PlanObject, mi: number, patch: Record<string, unknown>): PlanObject => ({ ...o, params: withWing(o.params, mi, (w) => ({ ...w, ...patch })) })

describe('Snap to porch and Fit to code', () => {
  test("C's twin pod stair starts 3.25 ft off its porch; snapping slides it back along its run until its top meets the porch", () => {
    const { plan } = scheme('C')
    const pod = plan.objects['C-2']
    expect(stairAttached(pod, 2)).toBe(false)
    const snap = snapToHost(buildingMasses(pod.params), 2)!
    expect(snap.dx).toBeCloseTo(0)
    expect(snap.dz).toBeCloseTo(17 - 3.25)
    const after = patched(pod, 2, snap)
    expect(stairAttached(after, 2)).toBe(true)
    expect(snapToHost(buildingMasses(after.params), 2)).toBeNull()
  })

  test('a stair already on its porch does not snap', () => {
    const { plan } = scheme('C')
    expect(snapToHost(buildingMasses(plan.objects['C-1'].params), 2)).toBeNull()
  })

  test("C's lantern stair: Fit to code lengthens the run to 11 in treads and keeps its top where it was", () => {
    const { plan, world } = scheme('C')
    const lantern = plan.objects['C-1']
    const fit = fitStairRun(world, lantern, 2)!
    const before = buildingMasses(lantern.params)[2]
    const after = patched(lantern, 2, fit)
    const m = buildingMasses(after.params)[2]
    expect(fit.d).toBeGreaterThan(before.d)
    expect(stairAxis(m).top[0]).toBeCloseTo(stairAxis(before).top[0])
    expect(stairAxis(m).top[1]).toBeCloseTo(stairAxis(before).top[1])
    const info = stairInfo(world, after, 2)!
    expect(info.ok).toBe(true)
    expect(info.tread).toBeGreaterThanOrEqual(11 * 0.0254 - 1e-6)
    expect(stairAttached(after, 2)).toBe(true)
    // fitted once, it fits
    expect(fitStairRun(world, after, 2)).toBeNull()
  })

  test("A's elders' ramp: Fit to code runs it out to 1:12", () => {
    const { plan, world } = scheme('A')
    const fit = fitStairRun(world, plan.objects['A-2'], 2)!
    const info = stairInfo(world, patched(plan.objects['A-2'], 2, fit), 2)!
    expect(info.steep).toBe(false)
  })

  test('a stair that already fits, or a part that is not a stair, has nothing to fit', () => {
    const { plan, world } = scheme('D')
    expect(fitStairRun(world, plan.objects['D-0'], 4)).toBeNull()
    expect(fitStairRun(world, plan.objects['D-0'], 0)).toBeNull()
  })
})
