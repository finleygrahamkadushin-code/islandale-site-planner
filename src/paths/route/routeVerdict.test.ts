import { describe, expect, test } from 'vitest'
import { loadIslandaleTerrain } from '../../site/islandale'
import { groundWithCuts } from '../../site/earthworks'
import { loadSchemes, schemeById } from '../../site/schemes'
import { planFromScheme } from '../../store/fromLegacy'
import type { PlanObject } from '../../store/types'
import { sunkCuts } from '../../scene/placement'
import type { Ground, PathKind } from '../pieces'
import { checkPieces } from './routeCheck'
import { routeGraph, type RouteAnchor, type RouteItem } from './routeGraph'
import { buildingRoutes, reportRows, routeReport } from './routeVerdict'

/** A straight piece along x from x0 to x1 at levels z0 → z1. */
function item(id: string, kind: PathKind, x0: number, x1: number, z0 = 0, z1 = z0, widthFt = 4): RouteItem {
  const L = Math.abs(x1 - x0)
  return {
    id,
    name: id,
    kind,
    widthFt,
    lengthM: L,
    ends: [
      { x: x0, n: 0, z: z0, reach: 0 },
      { x: x1, n: 0, z: z1, reach: 0 },
    ],
    profile: [
      { s: 0, z: z0, cross: 0 },
      { s: L, z: z1, cross: 0 },
    ],
    rail: false,
  }
}
const anchor = (id: string, type: RouteAnchor['type'], x: number, z = 0, building: string | null = 'H'): RouteAnchor => ({
  id,
  name: id,
  type,
  x,
  n: 0,
  z,
  reach: 0,
  building: type === 'driveway' ? null : building,
  dir: null,
})
const HOUSE = [{ id: 'H', name: 'Cabin' }]

function verdictsFor(items: RouteItem[], anchors: RouteAnchor[]) {
  const g = routeGraph(items, anchors)
  return buildingRoutes(g, checkPieces(g), HOUSE)
}

describe('route verdict per building', () => {
  test('a level walk from the driveway to the door is reachable', () => {
    // Arrange
    const items = [item('walk 1', 'walk', 0, 6.096)]
    const anchors = [anchor('drive', 'driveway', 0), anchor('door', 'door', 6.096)]

    // Act
    const [r] = verdictsFor(items, anchors)

    // Assert
    expect(r.ok).toBe(true)
    expect(r.text).toBe('Cabin: reachable, 20 ft, max 0.0 %')
  })

  test('a stair on the only way in breaks the accessible route', () => {
    const items = [item('walk 1', 'walk', 0, 3), item('Stair 1', 'stair', 3, 5, 0, 0.5), item('walk 2', 'walk', 5, 8, 0.5)]
    const anchors = [anchor('drive', 'driveway', 0), anchor('door', 'door', 8, 0.5)]
    const [r] = verdictsFor(items, anchors)
    expect(r.ok).toBe(false)
    expect(r.failing).toEqual(['Stair 1'])
    expect(r.text).toBe('Cabin: only by stairs (Stair 1) — stairs are not an accessible route (ADA 402.2 / A117.1 402.2); use a ramp')
  })

  test('a failing piece on the way is named', () => {
    // a 2.5 ft wide walk fails its width
    const items = [item('narrow', 'walk', 0, 6, 0, 0, 2.5)]
    const [r] = verdictsFor(items, [anchor('drive', 'driveway', 0), anchor('door', 'door', 6)])
    expect(r.text).toBe('Cabin: 1 piece fail (narrow)')
    expect(r.failing).toEqual(['narrow'])
  })

  test('a step up to the door is called out when every piece passes', () => {
    const items = [item('walk', 'walk', 0, 6)]
    const [r] = verdictsFor(items, [anchor('drive', 'driveway', 0), anchor('door', 'door', 6, 0.2)])
    // the walk itself fails for the step at its end, so it is named
    expect(r.ok).toBe(false)
    expect(r.failing).toEqual(['walk'])
  })

  test('without a driveway, or without a door, the verdict says so', () => {
    expect(verdictsFor([item('w', 'walk', 0, 6)], [anchor('door', 'door', 6)])[0].text).toBe('Cabin: no driveway on the site')
    expect(verdictsFor([item('w', 'walk', 0, 6)], [anchor('drive', 'driveway', 0)])[0].text).toBe('Cabin: no door or ramp to reach')
  })

  test('pieces that do not connect give no continuous route', () => {
    const [r] = verdictsFor([item('w', 'walk', 0, 3)], [anchor('drive', 'driveway', 0), anchor('door', 'door', 20)])
    expect(r.text).toBe('Cabin: no continuous route')
  })

  test('a ramp foot counts as a way in; a stair foot does not', () => {
    const items = [item('w', 'walk', 0, 6)]
    const ramp: RouteAnchor = { ...anchor('foot', 'wingfoot', 6), access: 'ramp' }
    const stair: RouteAnchor = { ...anchor('foot', 'wingfoot', 6), access: 'stair' }
    expect(verdictsFor(items, [anchor('drive', 'driveway', 0), ramp])[0].ok).toBe(true)
    expect(verdictsFor(items, [anchor('drive', 'driveway', 0), stair])[0].text).toBe('Cabin: no door or ramp to reach')
  })
})

describe('Scheme C from the data', () => {
  const terrain = loadIslandaleTerrain()
  const plan = planFromScheme(schemeById(loadSchemes(), 'C'))
  const objects: PlanObject[] = plan.order.map((id) => plan.objects[id])
  const ground: Ground = groundWithCuts(terrain, sunkCuts(objects, terrain))

  test('gives a verdict for each of the four cabins and the code-check rows', () => {
    // Act
    const rep = routeReport(objects, terrain, ground)
    const rows = reportRows(rep)

    // Assert
    expect(rep.routes.map((r) => r.name)).toEqual(objects.filter((o) => o.type === 'house').map((o) => o.name))
    expect(rep.routes.every((r) => r.text.startsWith(`${r.name}: `))).toBe(true)
    expect(rows.route.lines).toHaveLength(4)
    expect(rows.pieces.text).toMatch(/^\d+ pieces?, /)
  })

  test('takes the narrow path pads but not the 7 ft lanes', () => {
    const rep = routeReport(objects, terrain, ground)
    const names = rep.graph.items.map((i) => i.name)
    expect(names).toContain('Path to beach')
    expect(names).not.toContain('Lane · gravel')
  })
})
