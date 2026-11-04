import { deckStepsPlan, TREE_WELL_FT, type TreeWell } from '../../buildings/deckSteps'
import { CURVED_SHAPES, localToSite, signedArea, siteToLocal, type LocalPoint } from '../../buildings/footprint'
import { buildingToMass, edgeName, massBuildingPoly, massPoly, massToBuilding, partName, type Mass } from '../../buildings/masses'
import { offsetOutline } from '../../buildings/outline'
import { buildRoof, normaliseRoof } from '../../buildings/roof'
import { ftToM, mToFt } from '../../site/units'
import type { RailWorld } from '../../scene/railWorld'
import { stairInfo } from '../../scene/stairSite'
import type { PlanObject } from '../../store/types'
import { fitArcs } from './arcs'
import { edgeInArc, openingsOf, type UntaggedOpening } from './openings'
import type { SheetArc, SheetEdge, SheetPart, SheetRoof, SheetStair } from './types'

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

function edgesOf(m: Mass, outline: readonly LocalPoint[], arcs: readonly SheetArc[]): SheetEdge[] {
  const n = outline.length
  return outline.map((a, i) => {
    const b = outline[(i + 1) % n]
    const k = arcs.findIndex((arc) => edgeInArc(i, arc))
    return { index: i, a, b, lengthFt: Math.hypot(b[0] - a[0], b[1] - a[1]), name: edgeName(m, i), arc: k < 0 ? null : k }
  })
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

/** The eave line: a prow roof's own outline when it has one, else the walls grown by the overhang. */
function eaveOf(m: Mass, type: string): LocalPoint[] {
  const custom = (m.roofPts ?? []).filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  const eave = type === 'prow' && custom.length >= 3 ? custom.map(([x, z]): LocalPoint => [x, z]) : offsetOutline(massPoly(m), m.overhang)
  return eave.map((p) => massToBuilding(m, p))
}

function roofOf(m: Mass): SheetRoof | null {
  const type = normaliseRoof(m.roof)
  if (isAccess(m) || type === 'none') return null
  const prow = { roofPts: m.roofPts, gable: m.gable, vault: m.vault, dip: m.roofDip }
  const rise = buildRoof(massPoly(m), { type: m.roof, pitch: m.pitch, ridge: m.ridge, overhangFt: m.overhang, prow }).rise
  return { type, pitch: m.pitch, overhangFt: m.overhang, eave: eaveOf(m, type), riseFt: mToFt(rise) }
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
  const arcs = fitArcs(outline, true)
  return {
    massIndex: mi,
    name: site.standalone ? 'Deck' : partName(m, mi),
    kind: m.kind,
    wFt: m.w,
    dFt: m.d,
    dxFt: m.dx,
    dzFt: m.dz,
    rotDeg: m.rot,
    levelFt: site.standalone ? 0 : m.lvl,
    wallFt: m.kind === 'wall' || m.kind === 'porch' ? m.h : 0,
    outline,
    areaSqFt: Math.abs(signedArea(outline)),
    edges: edgesOf(m, outline, arcs),
    arcs,
    openings: site.standalone ? [] : openingsOf(site.o.params, m, mi, arcs),
    stair: stairOf(site, m, mi),
    roof: roofOf(m),
    stepBands: stepBandsOf(site, m),
    approximate: (CURVED_SHAPES as readonly string[]).includes(m.shape),
  }
}

/** Every point a part draws in plan: outline, eave and sitting steps. */
export function partPoints(p: Pick<SheetPart, 'outline' | 'roof' | 'stepBands'>): LocalPoint[] {
  return [...p.outline, ...(p.roof?.eave ?? []), ...p.stepBands.flat(2)]
}
