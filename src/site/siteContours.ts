import { contourLevels, isoSegments, terrainContours, type ContourLine, type IsoSegment } from './contours'
import { PATCH_SPACING_M, type CellRect, type Ground, type SiteEarthworks } from './earthworks/earthworks'
import { terrainBounds } from './terrain'
import type { Terrain } from './types'
import { ftToM } from './units'

/** The contour interval the planner draws, feet (darker every 10 ft). */
export const CONTOUR_STEP_FT = 2
/** How far below the lowest survey a cut may reach, metres: its contours are looked for that deep. */
const CUT_DEPTH_M = 3

/**
 * The ground's contours as the planner draws them, site metres: the
 * survey's contours outside every earthworks patch, and the reshaped
 * ground's contours inside them, so a sunk or bermed building's cut and
 * fill show. Shared by the 3D lot marks (SiteMarks) and the site plan sheet.
 */
export function siteContours(terrain: Terrain, works: SiteEarthworks, ground: Ground, stepFt = CONTOUR_STEP_FT): ContourLine[] {
  const step = ftToM(stepFt)
  // one rect per earthworks patch (objects whose reach overlaps share one), so no contour is drawn twice
  const rects = works.fields.map((f) => f.rect)
  const inCut = ([x1, n1, x2, n2]: IsoSegment) => rects.some((r) => insideRect(terrain, r, (x1 + x2) / 2, (n1 + n2) / 2))
  const lines = terrainContours(terrain, step).map((l) => ({ ...l, segments: l.segments.filter((g) => !inCut(g)) }))
  const b = terrainBounds(terrain)
  for (const r of rects) {
    const x0 = terrain.x0 + r.c0 * terrain.spacing
    const n0 = terrain.n0 + r.r0 * terrain.spacing
    const k = Math.round(terrain.spacing / PATCH_SPACING_M)
    const field = { nx: (r.c1 - r.c0) * k + 1, ny: (r.r1 - r.r0) * k + 1, x0, n0, spacing: PATCH_SPACING_M, at: (i: number, j: number) => ground(x0 + i * PATCH_SPACING_M, n0 + j * PATCH_SPACING_M) }
    contourLevels(b.minZ - CUT_DEPTH_M, b.maxZ, step).forEach((l) => lines.push({ ...l, segments: isoSegments(field, l.z) }))
  }
  return lines
}

function insideRect(t: Terrain, r: CellRect, x: number, n: number): boolean {
  const col = (x - t.x0) / t.spacing
  const row = (n - t.n0) / t.spacing
  return col >= r.c0 && col <= r.c1 && row >= r.r0 && row <= r.r1
}
