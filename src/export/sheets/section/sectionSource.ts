import { localToSite, type LocalPoint } from '../../../buildings/footprint'
import type { MeshData } from '../../../buildings/geom'
import { buildingMasses, deckObjectMass, massPoly, massToBuilding, type Mass } from '../../../buildings/masses'
import { buildRoof, normaliseRoof, roofParamsOf } from '../../../buildings/roofs/roof'
import { elevationAt } from '../../../site/terrain'
import type { Terrain } from '../../../site/types'
import { ftToM, mToFt, M_PER_FT } from '../../../site/units'
import type { PlanObject } from '../../../store/types'
import { planEarth } from '../model/earthworks'
import { roofFinishOf } from '../model/parts'
import type { SheetBuilding } from '../types'
import type { P3, Tri } from './sectionGeom'

/**
 * What a section reads beside the sheet model: each part's roof and gable
 * triangles from the very builder the scene uses, in the building frame
 * (feet, y above the main floor), and the finished and surveyed ground
 * under any building-frame point, feet above the main floor.
 */

export interface PartMeshes {
  readonly massIndex: number
  /** The roof's top (and a sculpted slab's underside), building-frame feet. */
  readonly roof: readonly Tri[]
  /** The gable ends standing on the walls under a pitched roof. */
  readonly gables: readonly Tri[]
  /** It has a floor of its own: walls and decks, and a porch unless it is a roof over part of a deck. */
  readonly floor: boolean
}

export interface SectionSource {
  readonly parts: readonly PartMeshes[]
  /** Finished grade (the earthworks applied, as the scene draws it) and surveyed grade under a building-frame point, feet above the main floor. */
  readonly grade: (p: LocalPoint) => number
  readonly survey: (p: LocalPoint) => number
}

/** The ground every building on the plan stands on, worked out once for all of them. */
export interface PlanGround {
  readonly terrain: Terrain
  readonly ground: (x: number, n: number) => number
}

export function planGround(objects: readonly PlanObject[], terrain: Terrain): PlanGround {
  const visible = objects.filter((o) => !o.hidden)
  return { terrain, ground: planEarth(visible, terrain).works.ground }
}

/** A roof mesh's triangles (mass-local metres, y from the wall top) in the building frame, feet above the main floor. */
export function meshTris(mesh: MeshData, m: Mass, baseFt: number): Tri[] {
  const q = mesh.positions
  const at = (i: number): P3 => {
    const [x, z] = massToBuilding(m, [q[i] / M_PER_FT, q[i + 2] / M_PER_FT])
    return [x, baseFt + mToFt(q[i + 1]), z]
  }
  const out: Tri[] = []
  for (let i = 0; i + 8 < q.length; i += 9) out.push([at(i), at(i + 3), at(i + 6)])
  return out
}

function partMeshes(o: PlanObject, m: Mass, mi: number, standalone: boolean): PartMeshes {
  const floor = m.kind === 'wall' || m.kind === 'deck' || (m.kind === 'porch' && m.slab !== false)
  const none = { massIndex: mi, roof: [], gables: [], floor }
  if (m.kind === 'stair' || m.kind === 'ramp' || normaliseRoof(m.roof) === 'none') return none
  const poly = massPoly(m)
  if (poly.length < 3) return none
  const built = buildRoof(poly, roofParamsOf(m, roofFinishOf(o, mi, standalone)))
  const top = (standalone ? 0 : m.lvl) + (m.kind === 'wall' || m.kind === 'porch' ? m.h : 0)
  return { massIndex: mi, roof: meshTris(built.roof, m, top), gables: meshTris(built.gables, m, top), floor }
}

/** One building's section source, from its object, the sheet model and the plan's ground. */
export function sectionSource(o: PlanObject, b: SheetBuilding, ground: PlanGround): SectionSource {
  const standalone = o.type === 'deck'
  const masses = standalone ? [deckObjectMass(o.params)] : buildingMasses(o.params)
  const floorM = ftToM(b.levels.floorNavdFt)
  const site = (p: LocalPoint) => localToSite(o.position, o.rotation, p)
  return {
    parts: masses.map((m, mi) => partMeshes(o, m, mi, standalone)),
    grade: (p) => {
      const [x, n] = site(p)
      return mToFt(ground.ground(x, n) - floorM)
    },
    survey: (p) => {
      const [x, n] = site(p)
      return mToFt(elevationAt(ground.terrain, x, n) - floorM)
    },
  }
}
