import { localToSite, num, type LocalPoint } from '../../buildings/footprint'
import { buildingMasses, deckObjectMass, type Mass } from '../../buildings/masses'
import { mToFt, ftToM } from '../../site/units'
import type { Terrain } from '../../site/types'
import { baseElevation } from '../../scene/placement'
import { planRailWorld } from '../../scene/railSite'
import type { RailWorld } from '../../scene/railWorld'
import type { PlanObject } from '../../store/types'
import { partPoints, sheetPart, type PartSite, type UntaggedPart } from './parts'
import type { SheetBuilding, SheetLevels, SheetOpening, SheetPart } from './types'

export { elevationView } from './elevation'

/**
 * The sheet model: every visible cabin and standalone deck, worked out from
 * the plan alone, in the building frame (feet), with the same floor, ground
 * and fitted openings the 3D scene draws.
 */

type Bounds = SheetBuilding['bounds']

const TAG_LETTER: Readonly<Record<SheetOpening['kind'], string>> = { door: 'D', slider: 'D', window: 'W', cutout: 'C' }

/** Main floor, metres NAVD88, as the scene sets the group (railOwner's base). */
export function floorOf(o: PlanObject, world: RailWorld): number {
  if (o.type === 'deck') return baseElevation(world.terrain, o, world.ground) + ftToM(Math.max(0, num(o.params.h, 0)))
  return baseElevation(world.terrain, o, world.ground)
}

/** Number the openings D1, W1, C1 … per building, in part order. */
function tagOpenings(parts: readonly UntaggedPart[]): SheetPart[] {
  const counts = new Map<string, number>()
  return parts.map((p) => ({
    ...p,
    openings: p.openings.map((op) => {
      const letter = TAG_LETTER[op.kind]
      const n = (counts.get(letter) ?? 0) + 1
      counts.set(letter, n)
      return { ...op, tag: `${letter}${n}` }
    }),
  }))
}

export function boundsOf(pts: readonly LocalPoint[]): Bounds {
  if (pts.length === 0) return { minx: 0, maxx: 0, minz: 0, maxz: 0 }
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  return { minx: Math.min(...xs), maxx: Math.max(...xs), minz: Math.min(...zs), maxz: Math.max(...zs) }
}

/** Vertices and edge midpoints of an outline, where the grade is read. */
const gradePoints = (outline: readonly LocalPoint[]): LocalPoint[] =>
  outline.flatMap((a, i) => {
    const b = outline[(i + 1) % outline.length]
    return [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const]
  })

function levelsOf(o: PlanObject, world: RailWorld, floorM: number, parts: readonly SheetPart[]): SheetLevels {
  const grades = parts.flatMap((p) =>
    gradePoints(p.outline).map((q) => {
      const [x, n] = localToSite(o.position, o.rotation, q)
      return mToFt(world.ground(x, n) - floorM)
    }),
  )
  const tops = parts.map((p) => p.levelFt + p.wallFt + (p.roof?.riseFt ?? 0))
  return {
    floorNavdFt: mToFt(floorM),
    gradeLowFt: grades.length ? Math.min(...grades) : 0,
    gradeHighFt: grades.length ? Math.max(...grades) : 0,
    topFt: Math.max(0, ...tops),
  }
}

/** Covered floor of enclosed rooms, and of decks and porches (a porch roof over a deck, with no floor of its own, is left out). */
function areasOf(parts: readonly SheetPart[], masses: readonly Mass[]): SheetBuilding['totalAreaSqFt'] {
  const sum = (keep: (p: SheetPart) => boolean) => parts.filter(keep).reduce((s, p) => s + p.areaSqFt, 0)
  return {
    enclosed: sum((p) => p.kind === 'wall'),
    decks: sum((p) => p.kind === 'deck' || (p.kind === 'porch' && masses[p.massIndex]?.slab !== false)),
  }
}

function sheetBuilding(o: PlanObject, world: RailWorld, trees: PartSite['trees']): SheetBuilding {
  const standalone = o.type === 'deck'
  const masses = standalone ? [deckObjectMass(o.params)] : buildingMasses(o.params)
  const floorM = floorOf(o, world)
  const site: PartSite = { o, masses, standalone, floorM, world, trees }
  const parts = tagOpenings(masses.map((_, mi) => sheetPart(site, mi)))
  const bounds = boundsOf(parts.flatMap(partPoints))
  const outlineBounds = boundsOf(parts.flatMap((p) => p.outline))
  const main = boundsOf(parts[0]?.outline ?? [])
  return {
    id: o.id,
    name: o.name,
    type: o.type,
    rotationDeg: o.rotation,
    parts,
    bounds,
    outlineBounds,
    datum: [main.minx, main.minz],
    levels: levelsOf(o, world, floorM, parts),
    totalAreaSqFt: areasOf(parts, masses),
  }
}

/** Every visible cabin ('house') and standalone deck, in the order given (plan.order mapped to objects). */
export function sheetBuildings(objects: readonly PlanObject[], terrain: Terrain): SheetBuilding[] {
  const world = planRailWorld(objects, terrain)
  const visible = objects.filter((o) => !o.hidden)
  const trees = visible.filter((o) => o.type === 'tree').map((o) => o.position)
  return visible.filter((o) => o.type === 'house' || o.type === 'deck').map((o) => sheetBuilding(o, world, trees))
}
