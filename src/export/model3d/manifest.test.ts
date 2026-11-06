import { describe, expect, test } from 'vitest'
import { loadIslandale } from '../../site/islandale'
import { CURRENT_SCHEME_ID, loadSchemes, schemeById } from '../../site/schemes'
import { planFromScheme } from '../../store/fromLegacy'
import { DEFAULT_ENVIRONMENT } from '../../store/types'
import { buildingMasses } from '../../buildings/masses'
import { ftToM } from '../../site/units'
import { buildManifest, MANIFEST_FORMAT, type ObjectNode } from './manifest'
import { nodeName, slugify } from './names'

const site = loadIslandale()
const plan = planFromScheme(schemeById(loadSchemes(), CURRENT_SCHEME_ID))
const FLOOR = 3.5
const nodes: ObjectNode[] = plan.order.map((id) => {
  const o = plan.objects[id]
  return { oid: id, node: nodeName(o), x: o.position.x, n: o.position.n, floor: FLOOR, rot: o.rotation }
})
const manifest = buildManifest({
  plan,
  site,
  environment: DEFAULT_ENVIRONMENT,
  nodes,
  slug: slugify(plan.name),
  source: { scene: plan.name, from: 'app', schemeId: plan.schemeId, exportedAt: '2026-11-06T00:00:00Z' },
})

describe("Scheme C's manifest", () => {
  test('is the old format, at true height, named after the scheme', () => {
    expect(manifest.format).toBe(MANIFEST_FORMAT)
    expect(manifest.exag).toBe(1)
    expect(manifest.files.glb).toBe('c-prow-lantern.glb')
    expect(manifest.site.tide_ft).toBe(DEFAULT_ENVIRONMENT.tideFt)
  })

  test('lists every object once, where its node is', () => {
    expect(manifest.objects.map((o) => o.oid)).toEqual(plan.order)
    const first = manifest.objects[0]
    expect(first).toMatchObject({ node: nodes[0].node, x: nodes[0].x, n: nodes[0].n, floor: FLOOR, rot: nodes[0].rot })
  })

  test('every house has its masses, with closed world outlines and heights', () => {
    const houses = manifest.objects.filter((o) => o.t === 'house')
    expect(houses.length).toBeGreaterThan(2)
    for (const h of houses) {
      const masses = buildingMasses(plan.objects[h.oid].params as Record<string, unknown>)
      expect(h.masses).toHaveLength(masses.length)
      h.masses!.forEach((m, mi) => {
        expect(m.outline.length).toBeGreaterThanOrEqual(3)
        expect(m.base_z).toBeCloseTo(FLOOR + ftToM(masses[mi].lvl), 3)
        expect(m.height_m).toBeCloseTo(ftToM(masses[mi].h), 3)
      })
    }
  })

  test('walled masses say how their walls run, and list each wall', () => {
    const all = manifest.objects.flatMap((o) => o.masses ?? [])
    const walled = all.filter((m) => m.kind === 'wall' && !m.open)
    expect(walled.length).toBeGreaterThan(0)
    for (const m of walled) {
      expect(m.wallEi).toBe(m.curved ? 'perimeter' : 'edge')
      expect(m.walls).toHaveLength(m.curved ? 1 : m.outline.length)
    }
    for (const m of all.filter((x) => x.kind !== 'wall')) expect(m.wallEi).toBe('none')
  })

  test('outlines sit near their building, in site metres', () => {
    for (const o of manifest.objects.filter((x) => x.masses)) {
      for (const m of o.masses!) for (const [x, n] of m.outline) expect(Math.hypot(x - o.x, n - o.n)).toBeLessThan(40)
    }
  })
})
