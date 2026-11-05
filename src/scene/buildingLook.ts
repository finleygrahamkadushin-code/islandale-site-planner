import type { ThreeEvent } from '@react-three/fiber'
import type { LocalPoint } from '../buildings/footprint'
import { extResolve, type ExtHost, type ExtResolved, type ExtTagPart } from '../buildings/paint/exterior'
import type { RailStyle } from '../buildings/rails/railEdits'
import type { EdgeRail } from '../buildings/rails/railRules'
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
  /** One element's finish (wall, roof, trim, rail…) through the exterior model (legacy extResolve), cached per building. */
  readonly ext: ExtLookup
}

export type ExtLookup = (mi: number, part: ExtTagPart, edge?: number | null) => ExtResolved

/** The pointer handlers every mesh of a cabin carries, so any part selects it. */
export interface MeshHandlers {
  readonly onClick: (e: ThreeEvent<MouseEvent>) => void
  readonly onPointerOver: (e: ThreeEvent<PointerEvent>) => void
  readonly onPointerMove?: (e: ThreeEvent<PointerEvent>) => void
  readonly onPointerOut: () => void
}

/** Ground and floor for one mass, in its own frame (feet in, metres out). */
export interface MassSite {
  /** The mass's index in the building (0 the main walls), for its exterior finishes. */
  readonly mi?: number
  /** Absolute elevation of the mass floor, metres. */
  readonly floor: number
  /** Ground elevation under a mass-local point (feet), metres. */
  readonly groundAt: (x: number, z: number) => number
  /** Whether a mass-local point lies inside one of the building's enclosed masses. */
  readonly insideWalls: (p: LocalPoint) => boolean
  /** Whether a mass-local point lies inside any other mass of the building (walls, porches, decks, stairs). */
  readonly insideOther: (p: LocalPoint) => boolean
  /** A deck's or porch's rail on each edge (railSite.objectRails); null or missing for masses without one. */
  readonly rails?: readonly EdgeRail[] | null
  /** The mass's rail style (its own exterior setting, else the building's). */
  readonly railStyle?: RailStyle
  /** Whether a mass-local point (feet) stands in front of a door of another mass, so a porch post there is left out. */
  readonly inDoorway?: (p: LocalPoint) => boolean
  /** A stair or ramp wing with a door at its top: its handrails start back from it (railSite clearTop). */
  readonly clearTop?: boolean
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
    ext: extLookup(o.params, o.type === 'deck' ? 'deck' : 'building'),
  }
}

const lookups = new WeakMap<object, ExtLookup>()

/** A building's exterior resolver, the same function (and its answers) while its params are unchanged. */
export function extLookup(params: Readonly<Record<string, unknown>>, host: ExtHost): ExtLookup {
  const hit = lookups.get(params)
  if (hit) return hit
  const answers = new Map<string, ExtResolved>()
  const fn: ExtLookup = (mi, part, edge = null) => {
    const key = `${mi}|${part}|${edge}`
    const known = answers.get(key)
    if (known) return known
    const r = extResolve(params, mi, part, edge, host)
    answers.set(key, r)
    return r
  }
  lookups.set(params, fn)
  return fn
}

/** Whether a resolved colour was painted (an exterior override), not the scheme's own or a default. */
export const isPainted = (r: ExtResolved): boolean => r.src.color === 'element' || r.src.color === 'mass' || r.src.color === 'house'

/** A slightly darker shade of a hex colour, for roofs in the Diagram style. */
export function shade(hex: string): string {
  const v = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.round(c * 0.78)
  return `#${[(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`
}

/** A part's painted colour on mass `mi`, or undefined to keep how it is drawn unpainted. */
export function paintedColour(look: BuildingLook, mi: number | undefined, part: ExtTagPart): string | undefined {
  const r = look.ext(mi ?? 0, part)
  return isPainted(r) ? r.color : undefined
}
