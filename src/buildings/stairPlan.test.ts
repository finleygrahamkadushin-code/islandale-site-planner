import { describe, expect, test } from 'vitest'
import { bounds, triangleCount, type MeshData } from './geom'
import { buildingMasses } from './masses'
import { band, evalH, hostCurve } from './stairCurve'
import { planStair, type StairItem, type StairSpec } from './stairPlan'
import { CLEAR_TOP_M, WING_RAIL_M } from './stairRails'
import { wingDropAtFoot, wingHost, wingStairSpec } from './stairWing'

const FT = 0.3048
const base: StairSpec = { kind: 'stair', w: 1.2, run: 2, drop: 0.9 }
const flatGround = (drop: number) => () => -drop
const of = (items: readonly StairItem[], role: StairItem['role']) => items.filter((i) => i.role === role)
const tris = (items: readonly StairItem[]) => items.reduce((s, i) => s + triangleCount(i.mesh), 0)
const box = (m: MeshData) => bounds(m)

describe('planStair: a stair', () => {
  test('splits the fixed run into one tread per 7 in riser', () => {
    const { info } = planStair({ ...base, groundAt: flatGround(0.9) })
    expect(info.n).toBe(6)
    expect(info.rise).toBeCloseTo(0.15)
    expect(info.tread).toBeCloseTo(2 / 6)
    expect(info.topNosingZ).toBeCloseTo(-1 + 2 / 6)
    // 13.1 in treads, 5.9 in risers
    expect(info.ok).toBe(true)
    expect(planStair({ ...base, run: 1.2 }).info.ok).toBe(false)
  })

  test('draws n treads, n risers, two stringers, a foot plate and both handrails', () => {
    const { items } = planStair({ ...base, groundAt: flatGround(0.9) })
    // each tread and riser is a box: 12 triangles
    expect(triangleCount(of(items, 'tread')[0].mesh)).toBe(6 * 12)
    expect(triangleCount(of(items, 'riser')[0].mesh)).toBe(6 * 12)
    expect(of(items, 'stringer')).toHaveLength(1)
    expect(of(items, 'foot')).toHaveLength(1)
    expect(of(items, 'rail').map((r) => r.side)).toEqual([-1, 1])
    expect(of(items, 'post')).toHaveLength(0)
  })

  test('the top tread is flush with the floor and the last nosing is at the foot', () => {
    const { items, info } = planStair(base)
    const t = box(of(items, 'tread')[0].mesh)
    expect(t.max[1]).toBeCloseTo(0)
    expect(t.min[2]).toBeCloseTo(-1)
    expect(t.max[2]).toBeCloseTo(1)
    expect(info.topTread).toHaveLength(1)
    // the last riser and the stringers reach the ground at the foot
    expect(box(of(items, 'riser')[0].mesh).min[1]).toBeCloseTo(-0.9)
    expect(box(of(items, 'stringer')[0].mesh).min[1]).toBeCloseTo(-0.9)
  })

  test('the foot plate is 10 cm thick, 2 cm proud of the ground and 60 cm long', () => {
    const f = box(of(planStair(base).items, 'foot')[0].mesh)
    expect(f.min[1]).toBeCloseTo(-0.98)
    expect(f.max[1]).toBeCloseTo(-0.88)
    expect(f.max[2] - f.min[2]).toBeCloseTo(0.6)
    expect(f.max[0] - f.min[0]).toBeCloseTo(1.3)
    expect(of(planStair({ ...base, footPlate: false }).items, 'foot')).toHaveLength(0)
  })

  test('handrails run 0.9 m over the nosing line from the top nosing, posts at most 1.2 m apart', () => {
    const { items, info } = planStair(base)
    const [left, right] = info.rails
    expect(left.skipped).toBe(false)
    expect(left.za).toBeCloseTo(-1 + 2 / 6)
    expect(left.zb).toBeCloseTo(1)
    // 1.67 m of rail: two bays, three posts
    expect(left.posts).toHaveLength(3)
    expect(right.posts).toHaveLength(3)
    expect(left.balusters).toBeGreaterThan(10)
    const r = box(of(items, 'rail')[1].mesh)
    expect(r.max[1]).toBeCloseTo(WING_RAIL_M + 0.03, 2)
    expect(r.max[0]).toBeCloseTo(0.6 - 0.03 + 0.03)
  })

  test('a door at the top starts the handrails 0.3 m further down and leaves out the top post', () => {
    const open = planStair(base).info.rails[0]
    const clear = planStair({ ...base, clearTop: true }).info
    expect(clear.clearTop).toBe(true)
    expect(clear.rails[0].za).toBeCloseTo(open.za + CLEAR_TOP_M)
    expect(clear.rails[0].posts).toHaveLength(open.posts.length - 1)
    expect(Math.min(...clear.rails[0].posts)).toBeGreaterThan(clear.rails[0].za + 0.1)
  })

  test('one riser gets no handrails; rail off or style none neither', () => {
    expect(planStair({ ...base, drop: 0.1 }).info.rails).toEqual([])
    expect(planStair({ ...base, rail: false }).info.rails).toEqual([])
    expect(of(planStair({ ...base, style: 'none' }).items, 'rail')).toHaveLength(0)
  })

  test('styles: glass adds panes, steel and cable a thinner section and no balusters', () => {
    expect(of(planStair({ ...base, style: 'glass' }).items, 'glass')).toHaveLength(2)
    const steel = planStair({ ...base, style: 'steel' })
    expect(steel.info.rails[0].balusters).toBe(0)
    expect(of(steel.items, 'glass')).toHaveLength(0)
    expect(tris(of(planStair({ ...base, style: 'cable' }).items, 'rail'))).toBeGreaterThan(tris(of(steel.items, 'rail')))
  })

  test('support posts stand every 2.4 m where the stringer is more than 0.4 m off the ground', () => {
    // a 5 m run down 2 m: one post each side at 2.4 m from the top
    const long = planStair({ kind: 'stair', w: 1.2, run: 5, drop: 2, groundAt: flatGround(2) })
    expect(long.info.posts).toBe(2)
    const p = box(of(long.items, 'post')[0].mesh)
    expect(p.min[1]).toBeCloseTo(-2.05)
    expect((p.min[2] + p.max[2]) / 2).toBeCloseTo(-2.5 + 2.4)
    // the same run on ground that follows the stringer: no gap, no post
    expect(planStair({ kind: 'stair', w: 1.2, run: 5, drop: 2, groundAt: (z) => -((z + 2.5) / 5) * 2 }).info.posts).toBe(0)
    // a short stair never needs one
    expect(planStair(base).info.posts).toBe(0)
  })

  test('the riser count can be forced (path pieces)', () => {
    const { info } = planStair({ ...base, n: 3 })
    expect(info.n).toBe(3)
    expect(info.rise).toBeCloseTo(0.3)
  })
})

describe('planStair: fitting the top to the host', () => {
  test('an angled host edge: the top tread reaches back to it on each side', () => {
    const topEdge = { a: [-1, -1.3] as const, b: [1, -0.7] as const }
    const { info } = planStair({ ...base, topEdge })
    const zs = info.topTread[0].map((p) => p[1])
    expect(Math.min(...zs)).toBeCloseTo(-1.18)
    const H = hostCurve(topEdge, 1.2, 2)
    expect(evalH(H, 0.6)).toBeCloseTo(-0.82)
    // the handrail on the far side starts 5 cm past the host where that is below the top nosing
    expect(info.rails[1].za).toBeCloseTo(Math.max(-1 + 2 / 6, evalH(H, 0.57) + 0.05))
  })

  test('band gives the region between a curve and a line, split where the curve passes it', () => {
    expect(band([[-1, -1], [1, -1]], 0)).toHaveLength(1)
    expect(band([[-1, -1], [0, 1], [1, -1]], 0)).toHaveLength(2)
    expect(band([[-1, 1], [1, 1]], 0)).toHaveLength(0)
  })
})

describe('planStair: a ramp', () => {
  test('one slope over the whole run, with its slope and a warning past 1:12', () => {
    const steep = planStair({ kind: 'ramp', w: 4 * FT, run: 7 * FT, drop: 0.3 })
    expect(steep.info.slope).toBeCloseTo(0.3 / (7 * FT))
    expect(steep.info.steep).toBe(true)
    expect(steep.info.n).toBe(0)
    expect(steep.info.ok).toBe(true)
    const gentle = planStair({ kind: 'ramp', w: 4 * FT, run: 12 * FT, drop: 12 * FT / 16 })
    expect(gentle.info.steep).toBe(false)
  })

  test('draws a surface, curbs, skirts, a foot plate and handrails on both sides', () => {
    const { items, info } = planStair({ kind: 'ramp', w: 1.2, run: 4, drop: 0.3, groundAt: (z) => -((z + 2) / 4) * 0.3 - 0.1 })
    for (const role of ['ramp', 'curb', 'skirt', 'foot'] as const) expect(of(items, role), role).toHaveLength(1)
    const s = box(of(items, 'ramp')[0].mesh)
    expect(s.max[1]).toBeCloseTo(0)
    expect(s.min[1]).toBeCloseTo(-0.45)
    expect(info.rails.map((r) => [r.skipped, r.zb])).toEqual([
      [false, 1.97],
      [false, 1.97],
    ])
    // the skirts go down to the ground under the run
    expect(box(of(items, 'skirt')[0].mesh).min[1]).toBeLessThan(-0.4)
  })

  test('a ramp has handrails on any drop, but none with its rail off or style none', () => {
    const ramp = { kind: 'ramp', w: 1.2, run: 4, drop: 0.05 } as const
    expect(planStair(ramp).info.rails).toHaveLength(2)
    expect(planStair({ ...ramp, rail: false }).info.rails).toEqual([])
    expect(of(planStair({ ...ramp, style: 'none' }).items, 'rail')).toHaveLength(0)
  })
})

describe('stair wings', () => {
  const house = (wing: Record<string, unknown>) => buildingMasses({ w: 20, d: 20, wings: [wing] })
  const site = (ground: number) => ({ floor: 10, groundAt: () => ground })

  test('the drop is floor minus the ground at the foot, never under 0.3 m, plus the level', () => {
    const [, stair] = house({ kind: 'stair', w: 4, d: 6, dz: 13 })
    expect(wingDropAtFoot(stair, site(9))).toBeCloseTo(1)
    expect(wingDropAtFoot(stair, site(10.2))).toBeCloseTo(0.3)
    const [, up] = house({ kind: 'stair', w: 4, d: 6, dz: 13, lvl: 2 })
    // floor here is the mass floor, building floor + 2 ft
    expect(wingDropAtFoot(up, { floor: 10 + 2 * FT, groundAt: () => 9 })).toBeCloseTo(1 + 2 * FT)
    const [, pinned] = house({ kind: 'stair', w: 4, d: 6, dz: 13, footZ: 9.4 })
    expect(wingDropAtFoot(pinned, site(9))).toBeCloseTo(0.6)
  })

  test('a wing set at 20° to the front wall fits its top to the wall line', () => {
    const a = (20 * Math.PI) / 180
    const masses = house({ kind: 'stair', w: 4, d: 6, rot: 20, dx: Math.sin(a) * 3, dz: 10 + Math.cos(a) * 3 })
    const host = wingHost(masses, 1)
    expect(host?.mi).toBe(0)
    const spec = wingStairSpec(masses, 1, site(9))!
    const H = hostCurve(spec.topEdge!, spec.w, spec.run)
    // across a 4 ft stair the wall line is 4 ft · tan 20° further along on one side
    expect(Math.abs(evalH(H, spec.w / 2) - evalH(H, -spec.w / 2))).toBeCloseTo(4 * FT * Math.tan(a), 3)
    expect((evalH(H, spec.w / 2) + evalH(H, -spec.w / 2)) / 2).toBeCloseTo(-spec.run / 2, 3)
    const { info } = planStair(spec)
    expect(info.topTread.length).toBeGreaterThan(0)
    expect(info.dropped).toBe(0)
  })

  test('a wing square to its host meets it on the nominal top line; one far away has no host', () => {
    const square = wingStairSpec(house({ kind: 'stair', w: 4, d: 6, dz: 13 }), 1, site(9))!
    const H = hostCurve(square.topEdge!, square.w, square.run)
    expect(evalH(H, 0)).toBeCloseTo(-square.run / 2)
    expect(wingStairSpec(house({ kind: 'stair', w: 4, d: 6, dz: 20 }), 1, site(9))!.host).toBeNull()
  })

  test('only stairs and ramps have a spec; a ramp wing is a ramp; rail off is kept', () => {
    const masses = house({ kind: 'ramp', w: 4, d: 7, dz: 13.5, rail: false })
    expect(wingStairSpec(masses, 0, site(9))).toBeNull()
    const spec = wingStairSpec(masses, 1, site(9))!
    expect(spec.kind).toBe('ramp')
    expect(spec.rail).toBe(false)
    expect(planStair(spec).info.rails).toEqual([])
  })
})
