/**
 * What stands on the lot, for the site plan: every building's parts, roofs
 * and earthworks taken from the plan sheets' own model, the path pieces,
 * boardwalks and bridges, pads, trees and the other site objects, and the
 * shadows the roofs cast. Site feet (x east, y north). Pure.
 */
import { localToSite, num, siteFootprint, siteToLocal, type LocalPoint } from '../../../buildings/footprint'
import { pointInPolygon } from '../../../site/geom2d'
import type { MassKind } from '../../../buildings/masses'
import { boardwalkPath, routePoints } from '../../../buildings/decks/boardwalk'
import { bridgeLayout, bridgeStyle } from '../../../buildings/decks/bridges'
import { labelPoint } from '../../../interiors/geom'
import { centreline, isPathPiece, pieceEnds, pieceKind, pieceLength, pieceSlope, pieceWidth, stairInfo, type PathKind } from '../../../paths/pieces'
import type { Ground } from '../../../site/earthworks/earthworks'
import { ruleOutline } from '../../../site/rules/ruleOutline'
import { seededRandom, treeSeed } from '../../../site/objects/treeShapes'
import type { SitePoint, Terrain } from '../../../site/types'
import { FT_PER_M, ftToM } from '../../../site/units'
import type { PlanObject } from '../../../store/types'
import type { SheetBuilding, SheetPart, SheetRoofLineKind } from '../types'
import type { Pt } from '../svgDims'

/** Site metres to site feet, x east and y north. */
export const toFt = ([x, n]: SitePoint): Pt => [x * FT_PER_M, n * FT_PER_M]

export interface SitePartMark {
  readonly kind: MassKind
  /** Outside face (walls) or edge (decks, porches, stairs), site feet. */
  readonly outline: readonly Pt[]
  /** The walls' inside face; empty on a part with no walls. */
  readonly inner: readonly Pt[]
  /** Stair nosings and the run from top to foot (for the DN arrow), site feet. */
  readonly nosings: readonly (readonly [Pt, Pt])[]
  readonly run: readonly [Pt, Pt] | null
  readonly stairLabel: string | null
}

export interface SiteRoofMark {
  readonly eave: readonly Pt[]
  /** The roof finish (glass, copper, metal, sod), or null for the standard one: drawn as its texture on the roof plan. */
  readonly finish: string | null
  /** Along the ridge (unit, site), for a metal roof's seams; null when the roof has no ridge line. */
  readonly ridgeDir: Pt | null
  readonly lines: readonly { readonly kind: SheetRoofLineKind; readonly pts: readonly Pt[] }[]
  /** A shed roof's arrow from its high side to its low side. */
  readonly slope: readonly [Pt, Pt] | null
}

export interface SiteBuildingMark {
  readonly id: string
  readonly name: string
  readonly floorNavdFt: number
  readonly parts: readonly SitePartMark[]
  readonly roofs: readonly SiteRoofMark[]
  /** Retaining walls as face and back lines, and sunken courts as outlines, site feet. */
  readonly walls: readonly { readonly face: readonly Pt[]; readonly back: readonly Pt[] }[]
  readonly courts: readonly (readonly Pt[])[]
  /** Where the name goes: inside the main walls, clear of them. */
  readonly label: Pt
  /** The ground the shadows fall from: each roof's eave and its height over the grade, feet. */
  readonly shadowCasters: readonly { readonly poly: readonly Pt[]; readonly heightFt: number }[]
}

export interface SitePathMark {
  readonly id: string
  readonly name: string
  readonly kind: PathKind
  readonly outline: readonly Pt[]
  /** Centre line from end A to end B, site feet. */
  readonly centre: readonly Pt[]
  /** Nosing lines across a stair. */
  readonly treads: readonly (readonly [Pt, Pt])[]
  /** Rise over run (0 when flat), and whether B is the high end. */
  readonly slope: number
  readonly upToB: boolean
  readonly risers: number
}

export interface SiteBridgeMark {
  readonly id: string
  readonly name: string
  /** Its two deck edges and centre line, and the columns or legs under it, site feet. */
  readonly left: readonly Pt[]
  readonly right: readonly Pt[]
  readonly centre: readonly Pt[]
  readonly columns: readonly Pt[]
  /** Deck boards every few feet, across the deck. */
  readonly boards: readonly (readonly [Pt, Pt])[]
}

export type SiteThingKind = 'pad' | 'pond' | 'pool' | 'meadow' | 'boulder' | 'shed' | 'other'

export interface SiteThingMark {
  readonly id: string
  readonly name: string
  readonly kind: SiteThingKind
  readonly outline: readonly Pt[]
  /** Parking stalls on a pad with cars. */
  readonly cars: number
  /** The lines between its parking stalls, across the pad's width (as the old site plan drew them), site feet. */
  readonly stalls: readonly (readonly [Pt, Pt])[]
}

export interface SiteTreeMark {
  readonly id: string
  readonly name: string
  readonly at: Pt
  readonly radiusFt: number
  /** A scalloped canopy edge, site feet, the same every time for this tree. */
  readonly canopy: readonly Pt[]
}

/** Boards across a bridge deck this far apart, feet. */
const BOARD_FT = 2.5
/** Canopy scallops per tree, and how deep they bite. */
const SCALLOPS = 11
const SCALLOP_DEPTH = 0.08

function partMark(p: SheetPart, toSite: (q: LocalPoint) => Pt): SitePartMark {
  const s = p.stair
  return {
    kind: p.kind,
    outline: p.outline.map(toSite),
    inner: p.inner.map(toSite),
    nosings: s ? s.nosings.map(([a, b]) => [toSite(a), toSite(b)] as const) : [],
    run: s ? [toSite(s.run[0]), toSite(s.run[1])] : null,
    stairLabel: s ? (s.kind === 'ramp' && s.slopeOneIn ? `1:${s.slopeOneIn.toFixed(1)} DN` : 'DN') : null,
  }
}

/** Every visible cabin and standalone deck, from the plan sheets' model, placed on the site. */
export function buildingMarks(buildings: readonly SheetBuilding[], objects: readonly PlanObject[]): SiteBuildingMark[] {
  const byId = new Map(objects.map((o) => [o.id, o]))
  return buildings.flatMap((b) => {
    const o = byId.get(b.id)
    if (!o) return []
    const toSite = (q: LocalPoint): Pt => toFt(localToSite(o.position, o.rotation, q))
    const grade = (b.levels.gradeLowFt + b.levels.gradeHighFt) / 2
    const roofed = b.parts.filter((p) => p.roof && p.roof.type !== 'none' && p.roof.eave.length > 2)
    const main = b.parts.find((p) => p.kind === 'wall') ?? b.parts[0]
    const labelAt = main ? labelPoint(main.outline) : null
    return [
      {
        id: b.id,
        name: b.name,
        floorNavdFt: b.levels.floorNavdFt,
        parts: b.parts.map((p) => partMark(p, toSite)),
        roofs: roofed.map((p) => ({
          eave: p.roof!.eave.map(toSite),
          finish: p.roof!.finish,
          ridgeDir: ridgeDirection(p.roof!.lines.filter((l) => l.kind === 'ridge').map((l) => l.pts.map(toSite))),
          lines: p.roof!.lines.map((l) => ({ kind: l.kind, pts: l.pts.map(toSite) })),
          slope: p.roof!.slope ? [toSite(p.roof!.slope.high), toSite(p.roof!.slope.low)] : null,
        })),
        walls: (b.earthworks?.walls ?? []).map((w) => ({ face: w.face.map(toSite), back: w.back.map(toSite) })),
        courts: (b.earthworks?.courts ?? []).map((c) => c.outline.map(toSite)),
        label: toSite(labelAt ?? [0, 0]),
        shadowCasters: roofed.map((p) => ({
          poly: p.roof!.eave.map(toSite),
          // the roof's middle height over the grade: a fair single height for a sloping roof's shadow
          heightFt: Math.max(0, p.levelFt + p.wallFt + p.roof!.riseFt / 2 - grade),
        })),
      },
    ]
  })
}

/** A path piece: its outline, centre line, stair treads, and which way is up. */
export function pathMark(o: PlanObject, ground: Ground): SitePathMark {
  const kind = pieceKind(o)
  const local = centreline(o)
  const toSite = (q: LocalPoint): Pt => toFt(localToSite(o.position, o.rotation, q))
  const ends = pieceEnds(o, ground)
  const stair = kind === 'stair' ? stairInfo(o, ground) : null
  const len = pieceLength(o)
  const half = pieceWidth(o) / 2
  const risers = stair?.risers ?? 0
  const treads =
    risers > 1 && local.length === 2
      ? Array.from({ length: risers - 1 }, (_, i) => {
          const x = -len / 2 + ((i + 1) * len) / risers
          return [toSite([x, -half]), toSite([x, half])] as const
        })
      : []
  return {
    id: o.id,
    name: o.name,
    kind,
    outline: siteFootprint(o).map(toFt),
    centre: local.map(toSite),
    treads,
    slope: pieceSlope(o, ground),
    upToB: ends.zB > ends.zA,
    risers,
  }
}

/** A bridge or boardwalk along its route: deck edges, centre line, boards and columns. */
export function bridgeMark(o: PlanObject, terrain: Terrain, ground: Ground, buildings: readonly PlanObject[]): SiteBridgeMark | null {
  const path = boardwalkPath(routePoints(o))
  if (!path) return null
  const width = ftToM(num(o.params.w, 5))
  const walls = buildings.flatMap((b) => ruleOutline(b, terrain))
  const inBuilding = (x: number, n: number) => walls.some((poly) => pointInPolygon(poly, x, n))
  const layout = bridgeLayout(path, width, bridgeStyle(o.params.style), ground, inBuilding)
  const h = layout.halfWidth
  const side = (k: 1 | -1): Pt[] => path.samples.map((s) => toFt([s.x + k * s.px * h, s.n + k * s.pn * h]))
  const centre = path.samples.map((s) => toFt([s.x, s.n]))
  const step = Math.max(1, Math.round(ftToM(BOARD_FT) / (path.length / Math.max(1, path.samples.length - 1))))
  const boards = path.samples
    .filter((_, i) => i > 0 && i < path.samples.length - 1 && i % step === 0)
    .map((s) => [toFt([s.x + s.px * h, s.n + s.pn * h]), toFt([s.x - s.px * h, s.n - s.pn * h])] as const)
  return {
    id: o.id,
    name: o.name,
    left: side(1),
    right: side(-1),
    centre,
    columns: layout.columns.map((i) => toFt([path.samples[i].x, path.samples[i].n])),
    boards,
  }
}

const THING_KIND: Readonly<Record<string, SiteThingKind>> = { pad: 'pad', pond: 'pond', pool: 'pool', meadow: 'meadow', boulder: 'boulder', shed: 'shed', shop: 'shed' }

/** A site object drawn by its outline; a boulder gets a rounded, irregular stone outline in its box. */
export function thingMark(o: PlanObject): SiteThingMark {
  const kind = THING_KIND[o.type] ?? 'other'
  const outline = kind === 'boulder' ? boulderOutline(o) : siteFootprint(o).map(toFt)
  const cars = Math.max(0, Math.round(num(o.params.cars, 0)))
  return { id: o.id, name: o.name, kind, outline, cars, stalls: kind === 'pad' ? stallLines(o, cars) : [] }
}

/** Most stalls drawn on one pad (the old site plan's limit). */
const MAX_STALLS = 8

/** Stall dividers: `cars` stalls side by side along the pad's width, each line across its depth, kept inside its outline. */
function stallLines(o: PlanObject, cars: number): (readonly [Pt, Pt])[] {
  const n = Math.min(MAX_STALLS, cars)
  if (n < 2) return []
  const w = num(o.params.w, 10)
  const d = num(o.params.d, 10)
  const local = siteFootprint(o).map((p) => siteToLocal(o.position, o.rotation, p))
  return Array.from({ length: n - 1 }, (_, i) => {
    const x = -w / 2 + ((i + 1) * w) / n
    const [z0, z1] = spanInside(local, x, d)
    return [toFt(localToSite(o.position, o.rotation, [x, z0])), toFt(localToSite(o.position, o.rotation, [x, z1]))] as const
  })
}

/** Where the line x = const runs inside a local outline, as its lowest and highest z (the full depth when it can't tell). */
function spanInside(poly: readonly LocalPoint[], x: number, d: number): readonly [number, number] {
  const zs: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]
    const [x2, z2] = poly[(i + 1) % poly.length]
    if ((x1 - x) * (x2 - x) > 0 || x1 === x2) continue
    zs.push(z1 + ((x - x1) / (x2 - x1)) * (z2 - z1))
  }
  return zs.length >= 2 ? [Math.min(...zs), Math.max(...zs)] : [-d / 2, d / 2]
}

/** The longest ridge's direction, unit, or null. */
function ridgeDirection(ridges: readonly (readonly Pt[])[]): Pt | null {
  let best: Pt | null = null
  let bestLen = 0
  for (const r of ridges) {
    if (r.length < 2) continue
    const a = r[0]
    const b = r[r.length - 1]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l > bestLen) {
      bestLen = l
      best = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]
    }
  }
  return best
}

function boulderOutline(o: PlanObject): Pt[] {
  const rand = seededRandom(treeSeed(o.id) ^ Math.round(num(o.params.seed, 1)))
  const w = num(o.params.w, 4) / 2
  const d = num(o.params.d, 3) / 2
  const k = 9
  const local = Array.from({ length: k }, (_, i): LocalPoint => {
    const a = (i / k) * Math.PI * 2 + (rand() - 0.5) * 0.35
    const r = 0.82 + rand() * 0.18
    return [Math.cos(a) * w * r, Math.sin(a) * d * r]
  })
  return local.map((q) => toFt(localToSite(o.position, o.rotation, q)))
}

/** A tree's canopy: a scalloped circle as wide as the tree's envelope. */
export function treeMark(o: PlanObject): SiteTreeMark {
  const radiusFt = Math.max(num(o.params.w, 20), num(o.params.d, 20)) / 2
  const at = toFt([o.position.x, o.position.n])
  const rand = seededRandom(treeSeed(o.id))
  const turn = rand() * Math.PI * 2
  const canopy = Array.from({ length: SCALLOPS * 6 }, (_, i): Pt => {
    const a = turn + (i / (SCALLOPS * 6)) * Math.PI * 2
    // each scallop bulges out between its two cusps
    const phase = ((i % 6) / 6) * Math.PI
    const r = radiusFt * (1 - SCALLOP_DEPTH + SCALLOP_DEPTH * Math.sin(phase))
    return [at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r]
  })
  return { id: o.id, name: o.name, at, radiusFt, canopy }
}

/** Which marks an object becomes on the site plan. */
export function sortObjects(objects: readonly PlanObject[]) {
  const visible = objects.filter((o) => !o.hidden)
  return {
    houses: visible.filter((o) => o.type === 'house'),
    paths: visible.filter((o) => isPathPiece(o)),
    bridges: visible.filter((o) => o.type === 'bridge'),
    trees: visible.filter((o) => o.type === 'tree'),
    things: visible.filter((o) => o.type !== 'house' && o.type !== 'deck' && o.type !== 'bridge' && o.type !== 'tree' && !isPathPiece(o)),
  }
}

/**
 * The shadow a roof casts with the sun at `dir` (unit vector to the sun:
 * east, north, up): the eave outline swept along the ground from where it
 * stands to where its shadow falls, as the outline, its shadow and one quad
 * per edge. Drawn in one flat tone they read as a single shadow. Empty with
 * the sun low or down.
 */
/** Below this sun height (the sine of about 7°) shadows would run off the sheet, so none are drawn. */
export const SHADOW_MIN_UP = 0.12

export function shadowPieces(poly: readonly Pt[], heightFt: number, dir: readonly [number, number, number], minUp = SHADOW_MIN_UP): Pt[][] {
  if (dir[2] < minUp || heightFt <= 0 || poly.length < 3) return []
  const dx = (-dir[0] / dir[2]) * heightFt
  const dy = (-dir[1] / dir[2]) * heightFt
  const moved = poly.map(([x, y]): Pt => [x + dx, y + dy])
  const quads = poly.map((p, i): Pt[] => {
    const q = poly[(i + 1) % poly.length]
    return [p, q, moved[(i + 1) % poly.length], moved[i]]
  })
  // one winding for every piece, so a nonzero fill unions them instead of cutting holes where they overlap
  return [[...poly], moved, ...quads].map(counterClockwise)
}

const signedArea2 = (poly: readonly Pt[]) => poly.reduce((s, [x1, y1], i) => {
  const [x2, y2] = poly[(i + 1) % poly.length]
  return s + x1 * y2 - x2 * y1
}, 0)

/** The polygon wound counter-clockwise (positive area, x right and y up). */
export const counterClockwise = (poly: readonly Pt[]): Pt[] => (signedArea2(poly) < 0 ? [...poly].reverse() : [...poly])
