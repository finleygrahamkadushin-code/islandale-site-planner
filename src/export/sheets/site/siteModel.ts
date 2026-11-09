/**
 * The site plan sheet's model: the lot and everything on it, worked out
 * from the plan with the same functions the app uses, in site feet (x east,
 * y north). Pure: plan, site, setbacks and ground in, data out. The setback
 * bands are a predicate (the rule itself), so the drawing hatches exactly
 * the ground the rule names.
 */
import { shoreBufferLine, topOfBankLine } from '../../../site/buffer'
import { isoSegments, type IsoSegment } from '../../../site/contours'
import type { Ground, SiteEarthworks } from '../../../site/earthworks/earthworks'
import { isShorelineEdge, ringEdges } from '../../../site/parcel'
import { setbackBand, TREE_ZONE_1_FT, TREE_ZONE_2_FT, type SetbackBand } from '../../../site/rules/setbacks'
import { pointFacts } from '../../../site/rules/tints'
import { siteContours } from '../../../site/siteContours'
import { sunPosition } from '../../../site/environment/sun'
import type { Site } from '../../../site/types'
import { ftToM, M_PER_FT } from '../../../site/units'
import { clearances } from '../../../site/rules/clearances'
import type { Environment, Plan, PlanObject, Setbacks } from '../../../store/types'
import { sheetBuildings } from '../model/model'
import type { Pt } from '../svgDims'
import { boxOf, chainSegments, simplifyLine, type Box } from './siteGeom'
import { bridgeMark, buildingMarks, pathMark, shadowPieces, sortObjects, thingMark, toFt, treeMark, type SiteBridgeMark, type SiteBuildingMark, type SitePathMark, type SiteThingMark, type SiteTreeMark } from './siteObjects'

export interface SiteLotLine {
  readonly a: Pt
  readonly b: Pt
  readonly lengthFt: number
}

export interface SiteContour {
  readonly ft: number
  readonly index: boolean
  readonly lines: readonly (readonly Pt[])[]
}

/** A building's nearest approach to the shore and to a side or rear lot line, as the inspector measures it, site feet. */
export interface SiteClearanceMark {
  readonly id: string
  readonly name: string
  readonly shore: { readonly from: Pt; readonly to: Pt; readonly dFt: number; readonly pastFt: number; readonly banked: boolean; readonly inside: boolean } | null
  readonly lot: { readonly from: Pt; readonly to: Pt; readonly dFt: number; readonly inside: boolean; readonly crosses: boolean } | null
}

export interface SiteSheetModel {
  /** The lot ring, closed implicitly, site feet. */
  readonly ring: readonly Pt[]
  /** The shoreline (OHWM) from its first edge to its last, one polyline. */
  readonly shoreline: readonly Pt[]
  /** The side and rear lot lines, edge by edge. */
  readonly lotLines: readonly SiteLotLine[]
  /** Lot-corner stakes, as the 3D lot marks place them. */
  readonly stakes: readonly Pt[]
  readonly topOfBank: readonly (readonly Pt[])[]
  readonly buffer: readonly (readonly Pt[])[]
  readonly sideLine: readonly (readonly Pt[])[]
  /** The tree protection zone lines (35 and 110 ft from the water), when the Setbacks panel shows them. */
  readonly treeZones: readonly { readonly ft: number; readonly lines: readonly (readonly Pt[])[] }[]
  readonly contours: readonly SiteContour[]
  readonly buildings: readonly SiteBuildingMark[]
  readonly paths: readonly SitePathMark[]
  readonly bridges: readonly SiteBridgeMark[]
  readonly things: readonly SiteThingMark[]
  readonly trees: readonly SiteTreeMark[]
  readonly clearances: readonly SiteClearanceMark[]
  /** Roof shadows as flat pieces (outline, its shadow and the quads between), site feet; empty with the sun down or shadows off. */
  readonly shadows: readonly (readonly Pt[])[]
  /** Where the sun was for the shadows: season and hour, as the Sun and tide panel set them. */
  readonly sun: { readonly season: Environment['season']; readonly hour: number; readonly up: boolean }
  /** Which band a ground point (site feet) is in: the setbacks rule itself. */
  readonly bandAt: (p: Pt) => SetbackBand
  /** Bounds of the lot and everything drawn on it, site feet. */
  readonly bounds: Box
  readonly setbacks: Setbacks
}

export interface SiteModelInput {
  readonly objects: readonly PlanObject[]
  readonly site: Site
  readonly setbacks: Setbacks
  readonly environment: Environment
  /** The displayed ground with every earthwork (useEarthworks), for contours, path ends and bridge columns. */
  readonly works: SiteEarthworks
  readonly ground: Ground
}

/** Contours are kept this far round the lot, feet; the page clips them to its own pad. */
const CONTOUR_REACH_FT = 60
/** Contours are thinned to this, feet: well under a printed hair at 1" = 16'. */
const THIN_FT = 0.03
/**
 * The buffer, bank, setback and tree-zone lines are traced on a half-metre
 * grid, whose crossings zig-zag a little: thinned this much they lose the
 * zig-zag and keep their course to well under a printed line's width.
 */
const RULE_THIN_FT = 0.15
/** The side setback line and tree zones are traced over a grid this fine, metres. */
const LINE_GRID_M = 0.5

const lines = (segs: readonly IsoSegment[], thin = RULE_THIN_FT): Pt[][] =>
  chainSegments(segs.map(([x1, n1, x2, n2]) => [...toFt([x1, n1]), ...toFt([x2, n2])] as const)).map((l) => simplifyLine(l, thin))

export function siteSheetModel(input: SiteModelInput): SiteSheetModel {
  const { site, setbacks, environment, works, ground } = input
  const { parcel, terrain } = site
  const objects = input.objects.filter((o) => !o.hidden)
  const ring = parcel.ring.map(toFt)
  const { first, last } = parcel.shorelineEdges
  const shoreline = ring.slice(first, last + 2)
  const lotLines = ringEdges(parcel.ring).flatMap(([a, b], i) =>
    isShorelineEdge(parcel, i) ? [] : [{ a: toFt(a), b: toFt(b), lengthFt: Math.hypot(b[0] - a[0], b[1] - a[1]) / M_PER_FT }],
  )
  const stakes = ring.filter((_, i) => !(i > first && i <= last))

  const sorted = sortObjects(objects)
  const buildings = buildingMarks(sheetBuildings(objects, terrain), objects)
  const sun = sunPosition(environment.season, environment.hour)
  const shadows = buildings.flatMap((b) => b.shadowCasters.flatMap((c) => shadowPieces(c.poly, c.heightFt, sun.direction)))
  const paths = sorted.paths.map((o) => pathMark(o, ground))
  const bridges = sorted.bridges.flatMap((o) => bridgeMark(o, terrain, ground, sorted.houses) ?? [])
  const things = sorted.things.map(thingMark)
  const trees = sorted.trees.map(treeMark)

  const lotBox = boxOf(ring)!
  const drawn = boxOf([
    ...ring,
    ...buildings.flatMap((b) => [...b.parts.flatMap((p) => p.outline), ...b.roofs.flatMap((r) => r.eave)]),
    ...paths.flatMap((p) => p.outline),
    ...bridges.flatMap((b) => [...b.left, ...b.right]),
    ...things.flatMap((t) => t.outline),
    ...trees.flatMap((t) => t.canopy),
  ])!
  const near = (l: readonly Pt[]) => l.some(([x, y]) => x > lotBox.minx - CONTOUR_REACH_FT && x < lotBox.maxx + CONTOUR_REACH_FT && y > lotBox.miny - CONTOUR_REACH_FT && y < lotBox.maxy + CONTOUR_REACH_FT)

  return {
    ring,
    shoreline,
    lotLines,
    stakes,
    topOfBank: lines(topOfBankLine(parcel, setbacks.bankFt)),
    buffer: lines(shoreBufferLine(parcel, setbacks.shoreFt, setbacks.bankFt)),
    sideLine: sideSetbackLine(input),
    treeZones: setbacks.treeZones ? treeZoneLines(input) : [],
    contours: mergeLevels(siteContours(terrain, works, ground).map((c) => ({ ft: c.ft, index: c.index, lines: lines(c.segments, THIN_FT).filter(near) }))),
    buildings,
    paths,
    bridges,
    things,
    trees,
    clearances: clearanceMarks(input, objects),
    shadows,
    sun: { season: environment.season, hour: environment.hour, up: shadows.length > 0 },
    bandAt: ([x, y]) => setbackBand(parcel, setbacks, ftToM(x), ftToM(y)),
    bounds: drawn,
    setbacks,
  }
}

function clearanceMarks({ site, setbacks }: SiteModelInput, objects: readonly PlanObject[]): SiteClearanceMark[] {
  // clearances reads the plan only for the nearest object, which the sheet doesn't draw
  const plan: Plan = { name: '', siteId: 'islandale', schemeId: null, objects: Object.fromEntries(objects.map((o) => [o.id, o])), order: objects.map((o) => o.id) }
  return objects
    .filter((o) => o.type === 'house')
    .map((o) => {
      const c = clearances(o, plan, site, setbacks)
      return {
        id: o.id,
        name: o.name,
        shore: c.shore && { from: toFt(c.shore.from), to: toFt(c.shore.to), dFt: c.shore.d / M_PER_FT, pastFt: c.shore.past / M_PER_FT, banked: c.shore.banked, inside: c.shore.insideBuffer },
        lot: c.lot && { from: toFt(c.lot.from), to: toFt(c.lot.to), dFt: c.lot.d / M_PER_FT, inside: c.lot.insideSetback || c.lot.crossesLot, crosses: c.lot.crossesLot },
      }
    })
}

/** One entry per level, lowest first: the survey's lines and every earthworks patch's at that level together. */
function mergeLevels(contours: readonly SiteContour[]): SiteContour[] {
  const byFt = new Map<number, SiteContour>()
  for (const c of contours) {
    if (!c.lines.length) continue
    const k = Math.round(c.ft * 1000)
    const had = byFt.get(k)
    byFt.set(k, had ? { ...had, lines: [...had.lines, ...c.lines] } : c)
  }
  return [...byFt.values()].sort((a, b) => a.ft - b.ft)
}

interface LotGrid {
  readonly nx: number
  readonly ny: number
  readonly x0: number
  readonly n0: number
  readonly facts: readonly ReturnType<typeof pointFacts>[]
}

/** pointFacts over a fine grid round the lot, metres, worked out once per parcel. */
const gridCache = new WeakMap<Site['parcel'], LotGrid>()
function lotGrid(parcel: Site['parcel']): LotGrid {
  const hit = gridCache.get(parcel)
  if (hit) return hit
  const xs = parcel.ring.map((p) => p[0])
  const ns = parcel.ring.map((p) => p[1])
  const x0 = Math.min(...xs) - LINE_GRID_M
  const n0 = Math.min(...ns) - LINE_GRID_M
  const nx = Math.ceil((Math.max(...xs) - x0) / LINE_GRID_M) + 2
  const ny = Math.ceil((Math.max(...ns) - n0) / LINE_GRID_M) + 2
  const facts = Array.from({ length: nx * ny }, (_, k) => pointFacts(parcel, x0 + (k % nx) * LINE_GRID_M, n0 + Math.floor(k / nx) * LINE_GRID_M))
  const grid = { nx, ny, x0, n0, facts }
  gridCache.set(parcel, grid)
  return grid
}

/**
 * The side and rear setback line: `sideFt` in from the lot lines, inside
 * the lot, and only where the shoreline buffer doesn't already cover the
 * ground (setbackBand gives the buffer first say).
 */
function sideSetbackLine({ site, setbacks }: SiteModelInput): Pt[][] {
  const g = lotGrid(site.parcel)
  const bank = ftToM(setbacks.bankFt)
  const shore = ftToM(setbacks.shoreFt)
  const at = (i: number, j: number) => {
    const f = g.facts[j * g.nx + i]
    if (!f.inLot || Math.min(f.dBank - bank, f.dShore) < shore) return NaN
    return f.dLine
  }
  return lines(isoSegments({ nx: g.nx, ny: g.ny, x0: g.x0, n0: g.n0, spacing: LINE_GRID_M, at }, ftToM(setbacks.sideFt)))
}

/** The tree protection zone lines: plain distance from the water, no bank offset, as treeZone measures it. */
function treeZoneLines({ site }: SiteModelInput): { ft: number; lines: Pt[][] }[] {
  const g = lotGrid(site.parcel)
  const at = (i: number, j: number) => {
    const f = g.facts[j * g.nx + i]
    return f.inLot ? Math.min(f.dBank, f.dShore) : NaN
  }
  return [TREE_ZONE_1_FT, TREE_ZONE_2_FT].map((ft) => ({ ft, lines: lines(isoSegments({ nx: g.nx, ny: g.ny, x0: g.x0, n0: g.n0, spacing: LINE_GRID_M, at }, ftToM(ft))) }))
}
