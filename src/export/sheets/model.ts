import { localToSite, num, type LocalPoint } from '../../buildings/footprint'
import { buildingMasses, deckObjectMass, type Mass } from '../../buildings/masses'
import { area, disjointTiles } from '../../interiors/geom'
import { elevationAt } from '../../site/terrain'
import { mToFt, ftToM } from '../../site/units'
import type { Terrain } from '../../site/types'
import { baseElevation } from '../../scene/placement'
import { planRailWorld } from '../../buildings/rails/railSite'
import type { RailWorld } from '../../buildings/rails/railWorld'
import type { PlanObject } from '../../store/types'
import { planEarth, sheetEarthworks, type PlanEarth } from './earthworks'
import { sheetFloors } from './interiors'
import { partPoints, sheetPart, type PartSite, type UntaggedPart } from './parts'
import { sheetSupports } from './supports'
import type { SheetBuilding, SheetLevels, SheetOpening, SheetPart } from './types'

export { elevationView } from './elevation'

/**
 * The sheet model: every visible cabin and standalone deck, worked out from
 * the plan alone, in the building frame (feet), with the same floor, ground
 * and fitted openings the 3D scene draws.
 */

type Bounds = SheetBuilding['bounds']

/** A wall corner this close to the bounding box's back-left corner is on it, feet (a quarter inch). */
const ON_CORNER_FT = 1 / 48

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

const lowHigh = (vs: readonly number[]) => (vs.length ? [Math.min(...vs), Math.max(...vs)] : [0, 0])

/** The parts whose outline the grade is read round: the walls, or every part of a building with none (a standalone deck). */
export const gradeParts = (parts: readonly SheetPart[]): readonly SheetPart[] => (parts.some((p) => p.kind === 'wall') ? parts.filter((p) => p.kind === 'wall') : parts)

/** Finished grade (the ground the scene draws) and surveyed grade round the walls, and the roof top. */
function levelsOf(o: PlanObject, world: RailWorld, floorM: number, parts: readonly SheetPart[]): SheetLevels {
  const at = gradeParts(parts).flatMap((p) => gradePoints(p.outline).map((q) => localToSite(o.position, o.rotation, q)))
  const [gradeLowFt, gradeHighFt] = lowHigh(at.map(([x, n]) => mToFt(world.ground(x, n) - floorM)))
  const [surveyLowFt, surveyHighFt] = lowHigh(at.map(([x, n]) => mToFt(elevationAt(world.terrain, x, n) - floorM)))
  const tops = parts.map((p) => p.levelFt + p.wallFt + (p.roof?.riseFt ?? 0))
  return { floorNavdFt: mToFt(floorM), gradeLowFt, gradeHighFt, surveyLowFt, surveyHighFt, topFt: Math.max(0, ...tops) }
}

/** Area of the union of some outlines, square feet: where they overlap, counted once. */
export const unionArea = (outlines: readonly (readonly LocalPoint[])[]): number => disjointTiles(outlines).reduce((s, t) => s + area(t), 0)

/**
 * Floor inside the walls' outside face, and of decks and porches outside
 * it (a porch roof over a deck, with no floor of its own, is left out),
 * each overlap counted once.
 */
export function areasOf(parts: readonly SheetPart[], masses: readonly Mass[]): SheetBuilding['totalAreaSqFt'] {
  const walls = parts.filter((p) => p.kind === 'wall').map((p) => p.outline)
  const decks = parts.filter((p) => p.kind === 'deck' || (p.kind === 'porch' && masses[p.massIndex]?.slab !== false)).map((p) => p.outline)
  const enclosed = unionArea(walls)
  return { enclosed, decks: decks.length ? Math.max(0, unionArea([...walls, ...decks]) - enclosed) : 0 }
}

function sheetBuilding(o: PlanObject, world: RailWorld, earth: PlanEarth, trees: PartSite['trees']): SheetBuilding {
  const standalone = o.type === 'deck'
  const masses = standalone ? [deckObjectMass(o.params)] : buildingMasses(o.params)
  const floorM = floorOf(o, world)
  const site: PartSite = { o, masses, standalone, floorM, world, trees }
  const parts = tagOpenings(masses.map((_, mi) => sheetPart(site, mi)))
  const bounds = boundsOf(parts.flatMap(partPoints))
  const outlineBounds = boundsOf(parts.flatMap((p) => p.outline))
  const mainOutline = parts[0]?.outline ?? []
  const main = boundsOf(mainOutline)
  const datumOnWall = mainOutline.some((p) => Math.hypot(p[0] - main.minx, p[1] - main.minz) <= ON_CORNER_FT)
  return {
    id: o.id,
    name: o.name,
    type: o.type,
    rotationDeg: o.rotation,
    parts,
    bounds,
    outlineBounds,
    datum: [main.minx, main.minz],
    datumOnWall,
    mainBounds: main,
    levels: levelsOf(o, world, floorM, parts),
    earthworks: sheetEarthworks(o, earth, world.terrain, floorM, parts[0]),
    supports: sheetSupports(site),
    floors: sheetFloors(o.params, masses, parts, standalone),
    totalAreaSqFt: areasOf(parts, masses),
  }
}

/** Every visible cabin ('house') and standalone deck, in the order given (plan.order mapped to objects). */
export function sheetBuildings(objects: readonly PlanObject[], terrain: Terrain): SheetBuilding[] {
  const visible = objects.filter((o) => !o.hidden)
  // the earthworks once, for the ground every part stands on and for their own drawing
  const earth = planEarth(visible, terrain)
  const world = planRailWorld(objects, terrain, earth.works.ground)
  const trees = visible.filter((o) => o.type === 'tree').map((o) => o.position)
  return visible.filter((o) => o.type === 'house' || o.type === 'deck').map((o) => sheetBuilding(o, world, earth, trees))
}
