import type { ThreeEvent } from '@react-three/fiber'
import type { LocalPoint } from '../buildings/footprint'
import type { DisplayStyle, PlanObject } from '../store/types'
import { diagramColourFor, type TextureName } from './Surface'

/** How a cabin's surfaces look, shared by all its masses. */
export interface BuildingLook {
  readonly style: DisplayStyle
  readonly color: string
  readonly roofColor: string
  readonly siding: TextureName
  readonly roofMat?: string
  readonly diagram: string
  readonly glow: number
}

/** The pointer handlers every mesh of a cabin carries, so any part selects it. */
export interface MeshHandlers {
  readonly onClick: (e: ThreeEvent<MouseEvent>) => void
  readonly onPointerOver: (e: ThreeEvent<PointerEvent>) => void
  readonly onPointerOut: () => void
}

/** Ground and floor for one mass, in its own frame (feet in, metres out). */
export interface MassSite {
  /** Absolute elevation of the mass floor, metres. */
  readonly floor: number
  /** Ground elevation under a mass-local point (feet), metres. */
  readonly groundAt: (x: number, z: number) => number
  /** Whether a mass-local point lies inside one of the building's enclosed masses. */
  readonly insideWalls: (p: LocalPoint) => boolean
  /** Whether a mass-local point lies inside any other mass of the building (walls, porches, decks, stairs). */
  readonly insideOther: (p: LocalPoint) => boolean
}

export function buildingLook(o: PlanObject, style: DisplayStyle, glow: number): BuildingLook {
  const p = o.params
  return {
    style,
    color: typeof p.color === 'string' ? p.color : '#c4a77d',
    roofColor: typeof p.roofColor === 'string' ? p.roofColor : '#3c4043',
    siding: p.siding === 'lap' ? 'lap' : p.siding === 'shingle' ? 'shingle' : 'batten',
    roofMat: typeof p.roofMat === 'string' ? p.roofMat : undefined,
    diagram: diagramColourFor(o.id),
    glow,
  }
}

/** A slightly darker shade of a hex colour, for roofs in the Diagram style. */
export function shade(hex: string): string {
  const v = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.round(c * 0.78)
  return `#${[(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`
}
