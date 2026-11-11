import { buildingMasses, massBuildingPoly, type Mass } from '../../buildings/masses'
import type { PlanObject } from '../../store/types'
import { ringArea } from '../parcel'

/**
 * The program budget (5E, old enclosedSqft / coveredSqft / deckSqft):
 * enclosed floor area per building against the 800 sq ft building cap and
 * the 1,600 sq ft total, plus covered porches and decks. Pure: objects in,
 * whole square feet out.
 */

/** Enclosed floor area allowed across every building, sq ft. Assumed with the one below (review R2.8): no source named; see ruleSources. */
export const PROGRAM_CAP_SQFT = 1600
/** Enclosed floor area allowed in any one building, sq ft. */
export const BUILDING_CAP_SQFT = 800

export interface BuildingProgram {
  readonly id: string
  readonly name: string
  readonly floors: number
  readonly enclosedSqFt: number
  readonly coveredSqFt: number
  readonly deckSqFt: number
  readonly over: boolean
}

export interface ProgramBudget {
  readonly buildings: readonly BuildingProgram[]
  readonly enclosedSqFt: number
  readonly coveredSqFt: number
  readonly deckSqFt: number
  /** Total enclosed is over PROGRAM_CAP_SQFT. */
  readonly overTotal: boolean
  /** Names of buildings over BUILDING_CAP_SQFT. */
  readonly overBuildings: readonly string[]
}

const areaOf = (m: Mass) => ringArea(massBuildingPoly(m))
const sumArea = (ms: readonly Mass[]) => ms.reduce((sum, m) => sum + areaOf(m), 0)

/** Stored interior floors (5B), at least 1. */
export function floorCount(params: Record<string, unknown>): number {
  return Array.isArray(params.floors) ? Math.max(1, params.floors.length) : 1
}

/** One cabin's enclosed, covered and deck areas, whole sq ft. */
export function buildingProgram(o: PlanObject): BuildingProgram {
  const [main, ...wings] = buildingMasses(o.params)
  const floors = floorCount(o.params)
  const enclosed = areaOf(main) * floors + sumArea(wings.filter((m) => !m.open))
  const covered = sumArea(wings.filter((m) => m.open && m.kind === 'porch'))
  const deck = sumArea(wings.filter((m) => m.kind === 'deck'))
  const enclosedSqFt = Math.round(enclosed)
  return {
    id: o.id,
    name: o.name,
    floors,
    enclosedSqFt,
    coveredSqFt: Math.round(covered),
    deckSqFt: Math.round(deck),
    over: enclosedSqFt > BUILDING_CAP_SQFT,
  }
}

/** The budget across every visible cabin. */
export function programBudget(objects: readonly PlanObject[]): ProgramBudget {
  const buildings = objects.filter((o) => o.type === 'house' && !o.hidden).map(buildingProgram)
  const total = (k: 'enclosedSqFt' | 'coveredSqFt' | 'deckSqFt') => buildings.reduce((sum, b) => sum + b[k], 0)
  const enclosedSqFt = total('enclosedSqFt')
  return {
    buildings,
    enclosedSqFt,
    coveredSqFt: total('coveredSqFt'),
    deckSqFt: total('deckSqFt'),
    overTotal: enclosedSqFt > PROGRAM_CAP_SQFT,
    overBuildings: buildings.filter((b) => b.over).map((b) => b.name),
  }
}
