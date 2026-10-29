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
  /**
   * Per-edge rail overrides (legacy rail-edit): true on, false off, a missing
   * edge auto. Undefined when the wing has no map, so it keeps the whole-wing
   * rule above. Keys past the outline's last edge are dropped.
   */
  readonly rails?: Readonly<Record<number, boolean>>
  /** The part's own name, if the scheme gives it one ("Cave hearth"). */
  readonly name?: string
  /** Stair or ramp foot elevation, metres NAVD88, when it is pinned. */
  readonly footZ?: number
  /** Stair handrails start back from a door at the top: true, false, or undefined to decide from the doors. */
  readonly clearTop?: boolean
}

const KINDS: readonly MassKind[] = ['wall', 'porch', 'deck', 'stair', 'ramp']
/** A cabin draws at most this many wings; later ones are ignored. */
export const MAX_WINGS = 12
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Index into params.wings of each wing mass: mass n is wings[wingSlots(p)[n - 1]].
 * Malformed entries are skipped and the list stops at MAX_WINGS, so every
 * mass index in the app (scene, openings, parts, rails) means the same wing.
 */
export function wingSlots(p: Record<string, unknown>): number[] {
  const wings = Array.isArray(p.wings) ? p.wings : []
  return wings.flatMap((w, i) => (isRecord(w) ? [i] : [])).slice(0, MAX_WINGS)
}

/** The main mass plus each valid wing, from a cabin's legacy params. */
export function buildingMasses(p: Record<string, unknown>): Mass[] {
  const main = toMass(p, true)
  const wings = wingSlots(p).map((i) => (p.wings as Record<string, unknown>[])[i])
  return [main, ...wings.map((w) => toMass(w, false, main))]
}

/** One raw wing parsed on its own (for edge counts and names; its height falls back to 9 ft, not the host's). */
export function wingMass(w: Record<string, unknown>): Mass {
  return toMass(w, false)
}

function toMass(p: Record<string, unknown>, isMain: boolean, host?: Mass): Mass {
  const m = baseMass(p, isMain, host)
  return isRecord(p.rails) ? { ...m, rails: railMap(p.rails, massPoly(m).length) } : m
}

function baseMass(p: Record<string, unknown>, isMain: boolean, host?: Mass): Mass {
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
    name: !isMain && typeof p.name === 'string' && p.name ? p.name : undefined,
    footZ: typeof p.footZ === 'number' && Number.isFinite(p.footZ) ? p.footZ : undefined,
    clearTop: typeof p.clearTop === 'boolean' ? p.clearTop : undefined,
  }
}

/** A stored per-edge map (keys are edge numbers, as strings once saved) → edges 0..n-1 with a boolean. */
function railMap(r: Record<string, unknown>, edgeCount: number): Record<number, boolean> {
  const out: Record<number, boolean> = {}
  for (const [k, v] of Object.entries(r)) {
    const i = Number(k)
    if (Number.isInteger(i) && i >= 0 && i < edgeCount && typeof v === 'boolean') out[i] = v
  }
  return out
}

const PART_WORDS: Record<MassKind, string> = { wall: 'Wing', porch: 'Porch', deck: 'Deck', stair: 'Stair', ramp: 'Ramp' }

/** "Main", "Stair 2", "Deck 3", or the part's own name: legacy partName, numbered by mass index. */
export function partName(m: Pick<Mass, 'kind' | 'name'>, massIndex: number): string {
  if (massIndex === 0) return 'Main'
  return m.name ?? `${PART_WORDS[m.kind]} ${massIndex}`
}

/** "back", "right", "front", "left" for a rect part's edges 0-3 (its own axes), else "edge N" counting from 1 (legacy edgeName). */
export function edgeName(m: Pick<Mass, 'shape'>, edge: number): string {
  return m.shape === 'rect' && edge >= 0 && edge < 4 ? (['back', 'right', 'front', 'left'] as const)[edge] : `edge ${edge + 1}`
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
