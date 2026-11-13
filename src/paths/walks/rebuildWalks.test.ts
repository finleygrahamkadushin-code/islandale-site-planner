import { describe, expect, test } from 'vitest'
import { loadIslandale } from '../../site/islandale'
import { elevationAt } from '../../site/terrain'
import { loadSchemes, schemeById } from '../../site/schemes'
import { planFromScheme } from '../../store/fromLegacy'
import { ftToM } from '../../site/units'
import { isPathPiece, pieceEnds } from '../pieces'
import { routeReport } from '../route/routeVerdict'
import { isWalkToRebuild, kindFor, rebuildWalks, surfaceOf, walkLine, walkPieces } from './rebuildWalks'

const site = loadIslandale()
const ground = (x: number, n: number) => elevationAt(site.terrain, x, n)
const planOf = (id: string) => planFromScheme(schemeById(loadSchemes(), id))
const objs = (p: ReturnType<typeof planOf>) => p.order.map((id) => p.objects[id])

describe('rebuilding walks as path pieces', () => {
  test('a run takes its kind from its slope', () => {
    expect(kindFor(0.04, 1)).toBe('walk')
    expect(kindFor(0.05, 1)).toBe('walk')
    expect(kindFor(-0.08, 1)).toBe('ramp')
    expect(kindFor(0.2, 1)).toBe('stair')
  })

  test('surfaces come from the walk name', () => {
    expect(surfaceOf('Lane · gravel')).toBe('gravel')
    expect(surfaceOf('Cedar ribbon · arrival walk')).toBe('boardwalk')
    expect(surfaceOf('Fire circle · flagstone')).toBe('pavers')
  })

  test('rills, driveways and patios are not walks', () => {
    const c = objs(planOf('C'))
    expect(c.filter((o) => /drive|park|patio/i.test(o.name)).some(isWalkToRebuild)).toBe(false)
    // one of Scheme C's beach paths, renamed as a rill
    const path = c.find((o) => /Path to beach/.test(o.name))!
    expect(isWalkToRebuild(path)).toBe(true)
    expect(isWalkToRebuild({ ...path, name: 'Rill · stone channel' })).toBe(false)
  })

  test("a ribbon becomes one piece per run, joined end to end, keeping its width", () => {
    // one of Scheme C's lanes drawn as a five-point ribbon, 40 ft long and 5 ft wide
    const lane = objs(planOf('C')).find((o) => /Lane/.test(o.name))!
    const pts = [[-20, 5.5], [-14, -4], [-1, -0.7], [9, -7], [20, 1.4]]
    const creek = { ...lane, name: 'Creek walk', params: { ...lane.params, shape: 'ribbon', pts, w: 40, d: 5 } }
    const line = walkLine(creek)
    expect(line.length).toBeGreaterThan(2)
    const pieces = walkPieces(creek, ground)
    expect(pieces).toHaveLength(line.length - 1)
    for (let k = 1; k < pieces.length; k++) {
      const a = pieceEnds(pieces[k - 1], ground).B
      const b = pieceEnds(pieces[k], ground).A
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-3)
    }
    expect(pieces.every((p) => p.params.d === creek.params.d && isPathPiece(p))).toBe(true)
  })

  test('steep runs become stairs or ramps with the ground level pinned at each end', () => {
    const c = planOf('C')
    const beach = objs(c).filter((o) => /Path to beach/.test(o.name)).flatMap((o) => walkPieces(o, ground))
    expect(beach.every((p) => p.params.kind === 'stair' || p.params.kind === 'ramp')).toBe(true)
    const e = beach[0].params.ends as { zA: number; zB: number }
    expect(Math.abs(e.zA - e.zB)).toBeGreaterThan(ftToM(1))
  })

  test('the plan: walks out, pieces in their place, one result; locked walks stay', () => {
    const c = planOf('C')
    const lane = objs(c).find((o) => /Lane/.test(o.name))!
    const r = rebuildWalks(c, site.terrain, ground, (id) => id === lane.id)
    expect(r.skipped).toEqual([lane.name])
    expect(r.plan.objects[lane.id]).toBe(lane)
    expect(objs(r.plan).filter(isWalkToRebuild)).toEqual([lane])
    expect(r.walks).toBeGreaterThan(0)
    expect(r.pieces).toBeGreaterThanOrEqual(r.walks)
    expect(new Set(r.plan.order).size).toBe(r.plan.order.length)
    expect(rebuildWalks(r.plan, site.terrain, ground, (id) => id === lane.id).plan).toBe(r.plan) // nothing left to do
  })

  test('after a rebuild the route check names real reasons, never fewer routes, and every piece is a kinded piece', () => {
    for (const { id } of loadSchemes()) {
      const p = planOf(id)
      const before = routeReport(objs(p), site.terrain, ground)
      const rebuilt = rebuildWalks(p, site.terrain, ground).plan
      const after = routeReport(objs(rebuilt), site.terrain, ground)
      expect(after.summary.routesOk, id).toBeGreaterThanOrEqual(before.summary.routesOk)
      expect(objs(rebuilt).filter(isWalkToRebuild), id).toHaveLength(0)
    }
    const c = routeReport(objs(rebuildWalks(planOf('C'), site.terrain, ground).plan), site.terrain, ground)
    expect(c.routes.find((r) => /Gathering prow/.test(r.name))!.text).toMatch(/only by its stair/)
  })

  test('no two pieces share an id, and no piece is shorter than 5 cm', () => {
    for (const s of loadSchemes()) {
      const r = rebuildWalks(planFromScheme(s), site.terrain, ground).plan
      expect(new Set(r.order).size, s.id).toBe(r.order.length)
      for (const id of r.order) if (r.objects[id].params.rebuiltFrom) expect(Number(r.objects[id].params.w), s.id).toBeGreaterThan(0.15)
    }
  })
})
