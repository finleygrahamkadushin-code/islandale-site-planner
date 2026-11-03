import type { EarthSpec, MainOutline } from './earthworksSpec'
import type { RetainingWall } from './earthworksWalls'
import type { SitePoint } from './types'

/** The data the earthworks passes take and give (legacy earthOps, EW, earthworkPlan). */

export type Ground = (x: number, n: number) => number

/** Terrain cells (column and row ranges, inclusive of the start, exclusive of the end) a patch must replace. */
export interface CellRect {
  readonly c0: number
  readonly c1: number
  readonly r0: number
  readonly r1: number
}

/** A building that reshapes the ground round it (legacy earthOps kind 'b'). */
export interface BuildingEarthOp {
  readonly kind: 'building'
  readonly id: string
  readonly spec: EarthSpec
  /** Outlines of every mass except stairs and ramps, site metres. */
  readonly polys: readonly (readonly SitePoint[])[]
  /** The main mass, for the berm and court sides. */
  readonly main: MainOutline
  /** Floor elevation (legacy o.floor), metres. */
  readonly floor: number
  /** Lowest survey under the building's corners (legacy grade − gradeChange), metres. */
  readonly gradeLow: number
}

/** A pond or rain garden (legacy earthOps kind 'p'). */
export interface PondEarthOp {
  readonly kind: 'pond'
  readonly id: string
  /** Its outline, site metres. */
  readonly poly: readonly SitePoint[]
  /** Bowl depth below the water, metres. */
  readonly depth: number
}

export type EarthOp = BuildingEarthOp | PondEarthOp

/** What the ground became at a raster sample, for the tints (legacy cls). */
export const EARTH_CLASS = { none: 0, bermOverCourt: 1, court: 2, pond: 3, wet: 6 } as const

/** One reshaped patch: a raster over a block of terrain cells, its border on terrain grid lines. */
export interface EarthField {
  readonly rect: CellRect
  readonly x0: number
  readonly n0: number
  /** Sample spacing, metres (the terrain spacing over 2, 4 or 8). */
  readonly h: number
  /** Cells across (east) and up (north); samples are (ni + 1) × (nj + 1), row-major from the south-west. */
  readonly ni: number
  readonly nj: number
  /** Displayed ground and survey at each sample, metres. */
  readonly z: Float32Array
  readonly zb: Float32Array
  readonly cls: Uint8Array
  /** How strongly a pond or wet-margin sample shows, 0–1. */
  readonly str: Float32Array
}

/** A pond's water, as its bowl was dug for it. */
export interface PondWater {
  readonly id: string
  readonly poly: readonly SitePoint[]
  /** Water level, metres. */
  readonly level: number
  readonly depth: number
}

/** A berm for the plan sheet (legacy earthworkPlan berms): its crest elevation and the walls it lies against. */
export interface BermLine {
  readonly id: string
  readonly top: number
  readonly edges: readonly (readonly [SitePoint, SitePoint])[]
}

export interface SiteEarthworks {
  readonly fields: readonly EarthField[]
  readonly ponds: ReadonlyMap<string, PondWater>
  readonly walls: readonly RetainingWall[]
  readonly berms: readonly BermLine[]
  /** The reshaped raster at a point (bilinear, or as the patch mesh draws it), or null outside every patch. */
  readonly sample: (x: number, n: number, drawn?: boolean) => number | null
  /** Displayed ground: the survey (bilinear) with every patch. */
  readonly ground: Ground
  /** The same ground as the meshes draw it (flat triangles), for draping. */
  readonly drawnGround: Ground
}
