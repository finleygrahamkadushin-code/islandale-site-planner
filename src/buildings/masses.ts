import { localFootprint, num, type LocalPoint } from './footprint'
import type { LegacyCut } from './openings'

export type MassKind = 'wall' | 'porch' | 'deck' | 'stair' | 'ramp'

/** Sitting steps down a deck edge, between vertices e0 and e1 of its outline. */
export interface DeckSteps {
  readonly e0: number
  readonly e1: number
  readonly tread: number
}

/**
 * One volume of a building: the main walls or one wing, in feet, as the
 * legacy `masses(o)` lists them. Offsets and rotation place it in the
 * building's local frame (+z front).
 */
export interface Mass {
  readonly main: boolean
  readonly kind: MassKind
  readonly open: boolean
  readonly dx: number
  readonly dz: number
  readonly rot: number
  readonly w: number
  readonly d: number
  readonly h: number
  /** Floor level above the building floor, feet. */
  readonly lvl: number
  readonly shape: string
  readonly taper?: number
  readonly skew?: number
  readonly pts?: readonly (readonly number[])[]
  readonly roof: string
  readonly pitch: number
  readonly ridge: 'x' | 'z'
  readonly overhang: number
  /** Prow roof extras: eave outline (feet), gable side, vaulted shell, tip dip (feet). */
  readonly roofPts?: readonly (readonly number[])[]
  readonly gable?: string
  readonly vault?: boolean
  readonly roofDip?: number
  readonly cuts: readonly LegacyCut[]
  readonly steps?: DeckSteps
  /** false: a roof over part of a deck, with no floor of its own. */
  readonly slab: boolean
  /** false: never railed; true: always railed; 'sides': a deck railed along its sides, ends open; undefined: the default rule (rails.ts guardRule). */
  readonly rail?: boolean | 'sides'
}

const KINDS: readonly MassKind[] = ['wall', 'porch', 'deck', 'stair', 'ramp']
const MAX_WINGS = 12
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The main mass plus each valid wing, from a cabin's legacy params. */
export function buildingMasses(p: Record<string, unknown>): Mass[] {
  const main = toMass(p, true)
  const wings = Array.isArray(p.wings) ? p.wings.filter(isRecord).slice(0, MAX_WINGS) : []
  return [main, ...wings.map((w) => toMass(w, false, main))]
}

function toMass(p: Record<string, unknown>, isMain: boolean, host?: Mass): Mass {
  const kind = isMain ? 'wall' : KINDS.includes(p.kind as MassKind) ? (p.kind as MassKind) : p.open ? 'porch' : 'wall'
  const access = kind === 'stair' || kind === 'ramp'
  return {
    main: isMain,
    kind,
    open: kind !== 'wall',
    dx: isMain ? 0 : num(p.dx, 0),
    dz: isMain ? 0 : num(p.dz, 0),
    rot: isMain ? 0 : num(p.rot, 0),
    w: Math.max(1, num(p.w, 10)),
    d: Math.max(1, num(p.d, 10)),
    h: access ? 0 : Math.max(0, num(p.h, host?.h ?? 9)),
    lvl: isMain ? 0 : clamp(num(p.lvl, 0), 0, 30),
    shape: typeof p.shape === 'string' ? p.shape : 'rect',
    taper: typeof p.taper === 'number' ? p.taper : undefined,
    skew: typeof p.skew === 'number' ? p.skew : undefined,
    pts: Array.isArray(p.pts) ? (p.pts as number[][]) : undefined,
    roof: access ? 'none' : typeof p.roof === 'string' ? p.roof : 'none',
    pitch: num(p.pitch, 6),
    ridge: p.ridge === 'z' ? 'z' : 'x',
    overhang: Math.max(0, num(p.overhang, isMain ? 1.5 : 1)),
    roofPts: Array.isArray(p.roofPts) ? (p.roofPts as number[][]) : undefined,
    gable: typeof p.gable === 'string' ? p.gable : undefined,
    vault: p.vault === true,
    roofDip: typeof p.roofDip === 'number' ? p.roofDip : undefined,
    cuts: Array.isArray(p.cuts) ? (p.cuts as LegacyCut[]) : [],
    steps: deckSteps(p.steps),
    slab: p.slab !== false,
    rail: typeof p.rail === 'boolean' || p.rail === 'sides' ? p.rail : undefined,
  }
}

function deckSteps(v: unknown): DeckSteps | undefined {
  if (!isRecord(v)) return undefined
  return { e0: Math.round(num(v.e0, 0)), e1: Math.round(num(v.e1, 0)), tread: clamp(num(v.tread, 1.75), 0.9, 4) }
}

/** The mass's own outline, feet, about its own centre. */
export function massPoly(m: Mass): readonly LocalPoint[] {
  return localFootprint(m)
}

/** A point in the mass's frame → the building's local frame (legacy massPolyLocal, three.js rotateY). */
export function massToBuilding(m: Mass, [x, z]: LocalPoint): LocalPoint {
  const a = (m.rot * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [m.dx + x * c + z * s, m.dz - x * s + z * c]
}

/** A point in the building's local frame → the mass's frame, inverse of massToBuilding. */
export function buildingToMass(m: Mass, [x, z]: LocalPoint): LocalPoint {
  const a = (m.rot * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const dx = x - m.dx
  const dz = z - m.dz
  return [dx * c - dz * s, dx * s + dz * c]
}

export function massBuildingPoly(m: Mass): LocalPoint[] {
  return massPoly(m).map((p) => massToBuilding(m, p))
}

export interface Bounds {
  readonly minx: number
  readonly maxx: number
  readonly minz: number
  readonly maxz: number
}

/** Bounding box of every mass in the building frame, feet (legacy bbox()). */
export function buildingBounds(masses: readonly Mass[]): Bounds {
  const pts = masses.flatMap(massBuildingPoly)
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  return { minx: Math.min(...xs), maxx: Math.max(...xs), minz: Math.min(...zs), maxz: Math.max(...zs) }
}
