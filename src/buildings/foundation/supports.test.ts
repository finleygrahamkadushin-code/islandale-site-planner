import { describe, expect, test } from 'vitest'
import type { LocalPoint } from '../footprint'
import { pointInPolygon } from './foundation'
import { bounds, emptyMesh } from '../geom'
import { addPrism, specTops, supportMeshes, supportPlan, type SupportOptions } from './supports'
import { M_PER_FT as FT } from '../../site/units'

const rect: LocalPoint[] = [[-15, -10], [15, -10], [15, 10], [-15, 10]]
const RADIUS_FT = 12
const circle: LocalPoint[] = Array.from({ length: 64 }, (_, i) => {
  const a = (i / 64) * 2 * Math.PI
  return [RADIUS_FT * Math.cos(a), RADIUS_FT * Math.sin(a)] as const
})
const flat = (dropM: number) => () => -dropM
const plan = (o: Partial<SupportOptions>) => supportPlan({ poly: rect, support: 'posts', spacingFt: 8, groundY: flat(3), ...o })

describe('posts under a curved floor (legacy curvedSupports / curvePosts)', () => {
  const p = plan({ poly: circle, spacingFt: 6 })
  const R = RADIUS_FT * FT
  const s = 6 * FT
  const radii = p.posts.map((q) => Math.hypot(q.x, q.z))

  test('every post stands inside the outline', () => {
    const m = circle.map(([x, z]) => [x * FT, z * FT] as const)
    expect(p.posts.length).toBeGreaterThan(12)
    expect(p.posts.every((q) => pointInPolygon(m, q.x, q.z))).toBe(true)
  })
  test('a ring of posts runs just inside the edge about every spacing', () => {
    const ring = p.posts.filter((_, i) => radii[i] > R - 0.5)
    expect(ring.length).toBeGreaterThanOrEqual(Math.round((2 * Math.PI * R) / s) - 1)
    for (const q of ring) expect(Math.hypot(q.x, q.z)).toBeLessThan(R)
    const sorted = [...ring].sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x))
    const gaps = sorted.map((q, i) => {
      const n = sorted[(i + 1) % sorted.length]
      return Math.hypot(n.x - q.x, n.z - q.z)
    })
    for (const g of gaps) expect(g).toBeGreaterThan(s * 0.7)
    for (const g of gaps) expect(g).toBeLessThan(s * 1.3)
  })
  test('an interior grid fills the middle, clear of the ring', () => {
    const inner = p.posts.filter((_, i) => radii[i] < R - s * 0.5)
    expect(inner.length).toBeGreaterThan(2)
    expect(radii.some((r) => r < s)).toBe(true)
  })
  test('a ring beam runs round the posts and row beams cross the floor', () => {
    const rows = p.beams.filter(([a, b]) => Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(b[0] - a[0]) > R)
    expect(p.beams.length).toBeGreaterThan(circle.length)
    expect(rows.length).toBeGreaterThan(0)
  })
  test('no bracing under a curve, as in the old planner', () => {
    expect(plan({ poly: circle, bracing: true }).braces).toEqual([])
  })
})

describe('support kinds', () => {
  test('posts, piers and pilings share the grid but differ in section, material and beams', () => {
    const posts = plan({ support: 'posts' })
    const piers = plan({ support: 'piers' })
    const piles = plan({ support: 'pilings' })
    // 30 x 20 ft at 8 ft spacing: 5 x 4
    expect(posts.posts).toHaveLength(20)
    expect(piers.posts).toHaveLength(20)
    expect(piles.posts).toHaveLength(20)
    expect(posts.section).toEqual({ size: 6 * 0.0254, round: false })
    expect(piers.section).toEqual({ size: 10 * 0.0254, round: true })
    expect(piles.section).toEqual({ size: 10 * 0.0254, round: true })
    // beams along every row and column, piers rows only
    expect(posts.beams).toHaveLength(4 + 5)
    expect(piers.beams).toHaveLength(4)
    const postMaterials = (p: ReturnType<typeof plan>) => supportMeshes(p, rect).filter((q) => q.part === 'post').map((q) => q.material)
    expect(postMaterials(posts)).toEqual(['wood'])
    expect(postMaterials(piers)).toEqual(['wood', 'concrete'])
    expect(postMaterials(piles)).toEqual(['wood'])
  })
  test('a given post size wins over the default', () => {
    expect(plan({ support: 'pilings', postIn: 12 }).section?.size).toBeCloseTo(12 * 0.0254)
  })
  test('a mast is one core with a strut to every plate point, and no posts', () => {
    const p = plan({ support: 'mast' })
    const tops = specTops(rect.map(([x, z]) => [x * FT, z * FT] as const), 'mast')
    expect(p.posts).toEqual([])
    expect(p.mast).not.toBeNull()
    expect(p.struts).toHaveLength(tops.length)
    expect(p.plate).toBe(true)
    // struts spring from the collar round the core and rise to just under the plate
    for (const s of p.struts) {
      expect(s.a[1]).toBeCloseTo(p.mast!.collarY)
      expect(s.b[1]).toBeCloseTo(-0.44)
      expect(Math.hypot(s.a[0] - p.mast!.x, s.a[2] - p.mast!.z)).toBeCloseTo(p.mast!.r * 1.2)
    }
    expect(p.mast!.bottom).toBeCloseTo(-3 - 0.7)
    const parts = supportMeshes(p, rect).map((q) => `${q.part}:${q.material}`)
    expect(parts).toEqual(expect.arrayContaining(['post:concrete', 'post:steel', 'foundation:steel']))
  })
  test('a mast stands where the plan puts it', () => {
    const p = plan({ support: 'mast', mastAt: [5, -2] })
    expect(p.mast!.x).toBeCloseTo(5 * FT)
    expect(p.mast!.z).toBeCloseTo(-2 * FT)
  })
  test('stilts rake out from the plate edge to footings on the ground, more of them than mast struts', () => {
    const p = plan({ support: 'stilts' })
    const mast = plan({ support: 'mast' })
    expect(p.struts.length).toBeGreaterThan(mast.struts.length)
    expect(p.footings).toHaveLength(p.struts.length)
    expect(p.posts).toEqual([])
    // the edge stilts lean out: their feet are further from the centre than their tops
    const tops = specTops(rect.map(([x, z]) => [x * FT, z * FT] as const), 'stilts')
    const edge = p.struts.slice(0, tops.length)
    for (const s of edge) expect(Math.hypot(s.b[0], s.b[2])).toBeGreaterThan(Math.hypot(s.a[0], s.a[2]))
    for (const s of p.struts) expect(s.b[1]).toBeCloseTo(-3.25)
    expect(supportMeshes(p, rect).map((q) => `${q.part}:${q.material}`)).toEqual(expect.arrayContaining(['post:white', 'post:concrete', 'foundation:white']))
  })
  test('a slab is a skirt into the ground with an apron; a skirt has no apron; earth draws nothing', () => {
    const slab = plan({ support: 'slab', groundY: flat(0.4) })
    expect(slab.skirtBottom).toBeCloseTo(-0.4 - 0.3)
    expect(slab.apron).toBe(true)
    expect(plan({ support: 'skirt', groundY: flat(0.4) }).apron).toBe(false)
    const earth = plan({ support: 'earth' })
    expect(supportMeshes(earth, rect)).toEqual([])
  })
  test('auto: a skirt close to the ground, posts once the floor is more than 1.6 m up', () => {
    expect(plan({ support: 'auto', groundY: flat(1) }).kind).toBe('skirt')
    expect(plan({ support: 'auto', groundY: flat(2) }).kind).toBe('posts')
  })
  test('each post runs down to the ground under it, not to one depth', () => {
    const slope = (x: number) => -1 - (x + 15) * 0.1
    const p = plan({ groundY: (x) => slope(x) })
    const west = p.posts.reduce((a, q) => (q.x < a.x ? q : a))
    const east = p.posts.reduce((a, q) => (q.x > a.x ? q : a))
    expect(west.y0).toBeGreaterThan(east.y0 + 0.5)
    for (const q of p.posts) expect(q.y0).toBeCloseTo(slope(q.x / FT) - 0.3)
  })
  test('a deck’s supports start under its boards', () => {
    const p = plan({ top: -0.3 })
    for (const q of p.posts) expect(q.y1).toBeCloseTo(-0.3)
  })
})

describe('bracing (legacy o.bracing on a square grid)', () => {
  test('X-braces between neighbouring posts along all four outer sides when the floor is high', () => {
    const p = plan({ bracing: true, groundY: flat(3) })
    // 5 x 4 grid: 4 bays front and back, 3 bays each end, two braces a bay
    expect(p.braces).toHaveLength(2 * (4 + 4 + 3 + 3))
    for (const b of p.braces) {
      expect(Math.min(b.a[1], b.b[1])).toBeCloseTo(-3)
      expect(Math.max(b.a[1], b.b[1])).toBeCloseTo(-3 + 3 * 0.85)
    }
  })
  test('none when not asked, or when the floor is 1.8 m up or less', () => {
    expect(plan({ bracing: false, groundY: flat(3) }).braces).toEqual([])
    expect(plan({ bracing: true, groundY: flat(1.5) }).braces).toEqual([])
  })
  test('braces are drawn in wood with the posts', () => {
    const p = plan({ bracing: true, groundY: flat(3) })
    const wood = supportMeshes(p, rect).find((q) => q.material === 'wood')!
    const unbraced = supportMeshes(plan({ groundY: flat(3) }), rect).find((q) => q.material === 'wood')!
    expect(wood.mesh.positions.length).toBeGreaterThan(unbraced.mesh.positions.length)
  })
})

describe('addPrism (legacy prismGeo)', () => {
  test('a four-sided post is a square of the given corner radius, capped', () => {
    const m = emptyMesh()
    addPrism(m, [0, 0, 0], [0, 2, 0], Math.SQRT2 * 0.1, 4, true)
    const b = bounds(m)
    expect(b.max[0]).toBeCloseTo(0.1)
    expect(b.min[2]).toBeCloseTo(-0.1)
    expect(b.max[1]).toBeCloseTo(2)
    // 4 sides x 2 + 2 caps x 2 triangles
    expect(m.positions.length / 9).toBe(12)
  })
  test('side faces point away from the axis', () => {
    const m = emptyMesh()
    addPrism(m, [0, 0, 0], [5, 0, 0], 0.2, 8)
    for (let i = 0; i < m.positions.length; i += 9) {
      const cy = (m.positions[i + 1] + m.positions[i + 4] + m.positions[i + 7]) / 3
      const cz = (m.positions[i + 2] + m.positions[i + 5] + m.positions[i + 8]) / 3
      const e1 = [m.positions[i + 3] - m.positions[i], m.positions[i + 4] - m.positions[i + 1], m.positions[i + 5] - m.positions[i + 2]]
      const e2 = [m.positions[i + 6] - m.positions[i], m.positions[i + 7] - m.positions[i + 1], m.positions[i + 8] - m.positions[i + 2]]
      const ny = e1[2] * e2[0] - e1[0] * e2[2]
      const nz = e1[0] * e2[1] - e1[1] * e2[0]
      expect(ny * cy + nz * cz).toBeGreaterThan(0)
    }
  })
})
