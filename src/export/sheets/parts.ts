import { deckStepsPlan, TREE_WELL_FT, type TreeWell } from '../../buildings/deckSteps'
import { localToSite, signedArea, siteToLocal, type LocalPoint } from '../../buildings/footprint'
import { extResolve } from '../../buildings/exterior'
import { isRoofFinish } from '../../buildings/finishes'
import { buildingToMass, massBuildingPoly, massPoly, massToBuilding, partName, type Mass } from '../../buildings/masses'
import { wallPlan, wallSpecsOf, type WallPlan, type WallSpec } from '../../buildings/wallShell'
import { ftToM, mToFt } from '../../site/units'
import type { RailWorld } from '../../scene/railWorld'
import { stairInfo } from '../../scene/stairSite'
import type { PlanObject } from '../../store/types'
import { fitCurves, type Curves } from './arcs'
import { aroundOf, curveKindOf, edgesOf, pointsOf } from './curves'
import { ellipseOf, fourCentreArcs } from './ellipse'
import { openingsOf, type UntaggedOpening } from './openings'
import { sheetRoof } from './roofs'
import type { FittedArc, SheetArc, SheetEdge, SheetEllipse, SheetPart, SheetRoof, SheetStair } from './types'

/** What every part of one building is worked out from. */
export interface PartSite {
  readonly o: PlanObject
  readonly masses: readonly Mass[]
  /** A standalone deck (type 'deck') rather than a cabin. */
  readonly standalone: boolean
  /** Main floor, metres NAVD88, as the scene sets the building's group. */
  readonly floorM: number
  readonly world: RailWorld
  /** Visible trees' positions, for the wells sitting steps part round. */
  readonly trees: readonly { readonly x: number; readonly n: number }[]
}

export type { UntaggedOpening } from './openings'
export type UntaggedPart = Omit<SheetPart, 'openings'> & { readonly openings: readonly UntaggedOpening[] }

const IN_PER_FT = 12
const isAccess = (m: Mass) => m.kind === 'stair' || m.kind === 'ramp'

/** The ground (metres) under a point in a mass's own frame. */
export function groundUnder(site: PartSite, m: Mass, p: LocalPoint): number {
  const [x, n] = localToSite(site.o.position, site.o.rotation, massToBuilding(m, p))
  return site.world.ground(x, n)
}

/** An ellipse's four-centre arcs when they come close enough, else the outline's own fitted arcs. */
function curvesOf(m: Mass, outline: readonly LocalPoint[]): Curves & { readonly ellipse: SheetEllipse | null } {
  const four = fourCentreArcs(m, outline)
  if (four) return { arcs: four.arcs, smooth: outline.map(() => true), ellipse: ellipseOf(m, four.errorFt) }
  return { ...fitCurves(outline, true), ellipse: ellipseOf(m, null) }
}

/** A part's walls in plan as the scene builds them: each edge's kind and thickness, and the band they make; null for a part with no walls. */
function wallsOf(site: PartSite, m: Mass, mi: number): { readonly specs: WallSpec[]; readonly plan: WallPlan } | null {
  if (site.standalone || m.kind !== 'wall') return null
  const poly = massPoly(m)
  const kinds = wallSpecsOf(site.o.params, mi, poly.length)
  const plan = wallPlan(poly, (e) => kinds[e]?.thicknessFt ?? 0)
  // the plan's thickness, as a zero-length edge carries the wall's before it
  return { specs: kinds.map((k, e) => ({ ...k, thicknessFt: plan.thicknessFt[e] })), plan }
}

/**
 * Each arc's inside face, round the same centre: in by the thickness where
 * the centre is inside the wall (a convex curve), out by it where the curve
 * is hollow. The shell sets its inside face square across on a smooth run,
 * so it is a true concentric arc.
 */
function withInnerRadii(arcs: readonly FittedArc[], edges: readonly SheetEdge[], area: number): SheetArc[] {
  return arcs.map((arc) => {
    const e = edges[arc.fromEdge]
    if (!e || e.thicknessFt <= 0) return { ...arc, innerRadiusFt: null }
    // the outward normal of its first edge (signedArea > 0 winds with the outward normal on the right, y up)
    const dx = e.b[0] - e.a[0]
    const dz = e.b[1] - e.a[1]
    const l = Math.hypot(dx, dz) || 1
    const s = area >= 0 ? 1 : -1
    const out: LocalPoint = [(s * dz) / l, (-s * dx) / l]
    const toCentre = (arc.centre[0] - (e.a[0] + e.b[0]) / 2) * out[0] + (arc.centre[1] - (e.a[1] + e.b[1]) / 2) * out[1]
    return { ...arc, innerRadiusFt: arc.radiusFt + (toCentre < 0 ? -e.thicknessFt : e.thicknessFt) }
  })
}

/** Width and depth of the drawn outline along the part's own axes. */
function extentOf(m: Mass): { w: number; d: number } {
  const poly = massPoly(m)
  if (poly.length === 0) return { w: m.w, d: m.d }
  const xs = poly.map((p) => p[0])
  const zs = poly.map((p) => p[1])
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) }
}

function stairOf(site: PartSite, m: Mass, mi: number): SheetStair | null {
  if (site.standalone || !isAccess(m)) return null
  const info = stairInfo(site.world, site.o, mi)
  if (!info) return null
  const treadFt = mToFt(info.tread)
  const risers = info.kind === 'stair' ? info.n : 0
  const nosings = Array.from({ length: Math.max(0, risers - 1) }, (_, k) => {
    const z = -m.d / 2 + (k + 1) * treadFt
    return [massToBuilding(m, [-m.w / 2, z]), massToBuilding(m, [m.w / 2, z])] as const
  })
  return {
    kind: info.kind,
    risers,
    riserIn: mToFt(info.rise) * IN_PER_FT,
    treadIn: treadFt * IN_PER_FT,
    widthFt: mToFt(info.w),
    runFt: mToFt(info.run),
    dropFt: mToFt(info.drop),
    slopeOneIn: info.kind === 'ramp' && info.slope > 0 ? 1 / info.slope : null,
    ok: info.ok && !info.steep,
    nosings,
    run: [massToBuilding(m, [0, -m.d / 2]), massToBuilding(m, [0, m.d / 2])],
  }
}

/** The roof's finish as the scene resolves it (RoofMesh's roofFinish): the exterior resolver's roof mat when it is a roof finish. */
export function roofFinishAt(site: PartSite, mi: number): string | null {
  const mat = extResolve(site.o.params, mi, 'roof', null, site.standalone ? 'deck' : 'building').mat
  return isRoofFinish(mat) ? mat : null
}

function roofOf(site: PartSite, m: Mass, mi: number): SheetRoof | null {
  return isAccess(m) ? null : sheetRoof(m, roofFinishAt(site, mi))
}

/** Sitting steps' tread bands, building frame, top first: the ground relative to the deck floor exactly as DeckStepsMesh takes it. */
function stepBandsOf(site: PartSite, m: Mass): LocalPoint[][][] {
  if (m.kind !== 'deck' || !m.steps) return []
  const floor = site.floorM + (site.standalone ? 0 : ftToM(m.lvl))
  const wells = site.standalone
    ? []
    : site.trees.map((t): TreeWell => {
        const [x, z] = buildingToMass(m, siteToLocal(site.o.position, site.o.rotation, [t.x, t.n]))
        return { x, z, r: TREE_WELL_FT }
      })
  const plan = deckStepsPlan(massPoly(m), m.steps, (x, z) => groundUnder(site, m, [x, z]) - floor, wells)
  return (plan?.bands ?? []).map((band) => band.pieces.map((piece) => piece.map((p) => massToBuilding(m, p))))
}

/** One part of a building as the sheets draw it; its openings are numbered later, per building. */
export function sheetPart(site: PartSite, mi: number): UntaggedPart {
  const m = site.masses[mi]
  const outline = massBuildingPoly(m)
  const { arcs: fitted, smooth, ellipse } = curvesOf(m, outline)
  const walls = wallsOf(site, m, mi)
  const edges = edgesOf(m, outline, fitted, smooth, walls?.specs)
  const arcs = withInnerRadii(fitted, edges, signedArea(outline))
  const around = aroundOf(outline)
  const { w, d } = extentOf(m)
  return {
    massIndex: mi,
    name: site.standalone ? 'Deck' : partName(m, mi),
    kind: m.kind,
    wFt: w,
    dFt: d,
    dxFt: m.dx,
    dzFt: m.dz,
    rotDeg: m.rot,
    levelFt: site.standalone ? 0 : m.lvl,
    wallFt: m.kind === 'wall' || m.kind === 'porch' ? m.h : 0,
    outline,
    inner: walls ? walls.plan.inner.map((p) => massToBuilding(m, p)) : [],
    perimeterFt: around[outline.length] ?? 0,
    areaSqFt: Math.abs(signedArea(outline)),
    edges,
    arcs,
    openings: site.standalone ? [] : openingsOf(site.o.params, m, mi, arcs, edges, around, walls?.plan ?? null),
    stair: stairOf(site, m, mi),
    roof: roofOf(site, m, mi),
    stepBands: stepBandsOf(site, m),
    curve: curveKindOf(m.shape),
    ellipse,
    points: pointsOf(outline, edges, curveKindOf(m.shape) !== null),
  }
}

/** Every point a part draws in plan: outline, eave and sitting steps. */
export function partPoints(p: Pick<SheetPart, 'outline' | 'roof' | 'stepBands'>): LocalPoint[] {
  return [...p.outline, ...(p.roof?.eave ?? []), ...p.stepBands.flat(2)]
}
