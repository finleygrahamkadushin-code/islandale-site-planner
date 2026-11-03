import { terrainBounds } from './terrain'
import type { Terrain } from './types'

const FT = 0.3048
const INDEX_EVERY_FT = 10

/** A sampled scalar field on a regular grid in the site frame (metres). */
export interface Field {
  readonly nx: number
  readonly ny: number
  readonly x0: number
  readonly n0: number
  readonly spacing: number
  readonly at: (i: number, j: number) => number
}

/** A segment of an iso-line: [x1, n1, x2, n2], site metres. */
export type IsoSegment = readonly [number, number, number, number]

/**
 * Marching squares over a field, as the legacy earthContourSegs() did per
 * terrain cell: where a level crosses a cell's edges, join the crossings in
 * pairs. Crossings fall on grid edges, where bilinear ground is exact.
 */
export function isoSegments(f: Field, level: number): IsoSegment[] {
  const out: IsoSegment[] = []
  for (let j = 0; j + 1 < f.ny; j++) {
    for (let i = 0; i + 1 < f.nx; i++) {
      const corners: [number, number, number][] = [
        [i, j, f.at(i, j)],
        [i + 1, j, f.at(i + 1, j)],
        [i + 1, j + 1, f.at(i + 1, j + 1)],
        [i, j + 1, f.at(i, j + 1)],
      ]
      const pts: [number, number][] = []
      for (let e = 0; e < 4; e++) {
        const [ai, aj, a] = corners[e]
        const [bi, bj, b] = corners[(e + 1) % 4]
        if (!Number.isFinite(a) || !Number.isFinite(b) || a < level === b < level) continue
        const t = (level - a) / (b - a)
        pts.push([f.x0 + (ai + (bi - ai) * t) * f.spacing, f.n0 + (aj + (bj - aj) * t) * f.spacing])
      }
      for (let q = 0; q + 1 < pts.length; q += 2) out.push([pts[q][0], pts[q][1], pts[q + 1][0], pts[q + 1][1]])
    }
  }
  return out
}

export interface ContourLevel {
  /** Elevation, metres NAVD88. */
  readonly z: number
  readonly ft: number
  /** Every 10 ft: drawn darker. */
  readonly index: boolean
}

/** Contour levels every `stepM` from the lowest to the highest ground. */
export function contourLevels(minZ: number, maxZ: number, stepM: number): ContourLevel[] {
  const stepFt = Math.round((stepM / FT) * 1000) / 1000
  const out: ContourLevel[] = []
  for (let k = Math.ceil(minZ / stepM + 1e-9); k * stepM <= maxZ; k++) {
    const ft = Math.round(k * stepFt * 1000) / 1000
    out.push({ z: k * stepM, ft, index: Math.abs(ft / INDEX_EVERY_FT - Math.round(ft / INDEX_EVERY_FT)) < 1e-6 })
  }
  return out
}

export interface ContourLine extends ContourLevel {
  readonly segments: readonly IsoSegment[]
}

/** Ground contours every `stepM` over the whole terrain grid. */
export function terrainContours(t: Terrain, stepM: number): ContourLine[] {
  const b = terrainBounds(t)
  const field: Field = { nx: t.nx, ny: t.ny, x0: t.x0, n0: t.n0, spacing: t.spacing, at: (i, j) => t.z[j * t.nx + i] }
  return contourLevels(b.minZ, b.maxZ, stepM).map((l) => ({ ...l, segments: isoSegments(field, l.z) }))
}
