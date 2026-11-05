import type { LocalPoint } from '../../../buildings/footprint'
import { massBuildingPoly, massPoly, massToBuilding, partName, type Mass } from '../../../buildings/masses'
import { buildingSupports, deckSupports } from '../../../buildings/foundation/supportParams'
import { BEAM_H_M, BEAM_W_M, FOOTING_R_M, MAST_FOOT_R, MAST_HEAD_R, SUPPORT_EMBED_M, supportPlan, type SupportPlan } from '../../../buildings/foundation/supports'
import { DECK_BEAM_M, DECK_M, DECK_POST_M, deckPostPoints, deckRimOutline, insideAny, keptPorchPosts, PORCH_POST_M, standingPosts } from '../../../buildings/decks/wingPosts'
import { ftToM, mToFt } from '../../../site/units'
import { objectRailSite } from '../../../buildings/rails/railSite'
import { groundUnder, type PartSite } from '../model/parts'
import type { SheetStrut, SheetSupport, SheetSupportPost } from '../types'

/**
 * What every part stands on, laid out by the same functions the 3D scene
 * builds its supports with (supportPlan under walls and standalone decks,
 * the wing helpers under deck and porch wings), with the same params,
 * ground and floor, turned into the building frame, feet.
 */

type Seg = readonly [LocalPoint, LocalPoint]
const FT_PER_M = mToFt(1)

/** Everything a mass's supports are worked out from, in its own frame. */
interface MassFrame {
  readonly site: PartSite
  readonly m: Mass
  readonly mi: number
  /** The mass floor, feet relative to the main floor, and metres NAVD88. */
  readonly levelFt: number
  readonly floorM: number
}

const toBuilding = (f: MassFrame, [x, z]: LocalPoint): LocalPoint => massToBuilding(f.m, [x, z])
/** Ground under a mass-local point (feet), metres from the mass floor, as the scene's MassSite gives it. */
const groundY = (f: MassFrame) => (x: number, z: number) => groundUnder(f.site, f.m, [x, z]) - f.floorM
/** A height in metres from the mass floor, as feet relative to the main floor. */
const rel = (f: MassFrame, yM: number) => f.levelFt + yM * FT_PER_M

function axisDeg(m: Mass): number {
  const [x0, z0] = massToBuilding(m, [0, 0])
  const [x1, z1] = massToBuilding(m, [1, 0])
  return (Math.atan2(z1 - z0, x1 - x0) * 180) / Math.PI
}

const empty = (f: MassFrame, kind: SheetSupport['kind']): SheetSupport => ({
  massIndex: f.mi,
  part: f.site.standalone ? 'Deck' : partName(f.m, f.mi),
  kind,
  axisDeg: axisDeg(f.m),
  section: null,
  posts: [],
  embedFt: mToFt(SUPPORT_EMBED_M),
  beams: [],
  beam: null,
  bracedBays: 0,
  mast: null,
  struts: [],
  footingDiameterFt: null,
  skirt: null,
  plate: false,
})

const strut = (f: MassFrame, s: SupportPlan['struts'][number]): SheetStrut => ({
  a: toBuilding(f, [s.a[0] * FT_PER_M, s.a[2] * FT_PER_M]),
  b: toBuilding(f, [s.b[0] * FT_PER_M, s.b[2] * FT_PER_M]),
  aFt: rel(f, s.a[1]),
  bFt: rel(f, s.b[1]),
})

/** A supportPlan (metres, mass-local) in the building frame. */
function fromPlan(f: MassFrame, plan: SupportPlan): SheetSupport {
  const at = (x: number, z: number) => toBuilding(f, [x * FT_PER_M, z * FT_PER_M])
  const posts = plan.posts.map((p): SheetSupportPost => ({ at: at(p.x, p.z), topFt: rel(f, p.y1), footFt: rel(f, p.y0 + SUPPORT_EMBED_M), onGround: true }))
  const mast = plan.mast
  return {
    ...empty(f, plan.kind),
    section: plan.section ? { sizeFt: plan.section.size * FT_PER_M, round: plan.section.round } : null,
    posts,
    beams: plan.beams.map(([a, b]): Seg => [at(a[0], a[1]), at(b[0], b[1])]),
    beam: plan.beams.length ? { depthFt: mToFt(BEAM_H_M), widthFt: mToFt(BEAM_W_M) } : null,
    // each braced bay is a pair of crossing braces
    bracedBays: plan.braces.length / 2,
    mast: mast
      ? { at: at(mast.x, mast.z), footDiameterFt: mToFt(2 * mast.r * MAST_FOOT_R), headDiameterFt: mToFt(2 * mast.r * MAST_HEAD_R), collarFt: rel(f, mast.collarY), bottomFt: rel(f, mast.bottom) }
      : null,
    struts: plan.struts.map((s) => strut(f, s)),
    footingDiameterFt: plan.footings.length ? mToFt(2 * FOOTING_R_M) : null,
    skirt: plan.skirtBottom === null ? null : { bottomFt: rel(f, plan.skirtBottom), apron: plan.apron },
    plate: plan.plate,
  }
}

/** Under an enclosed mass (WallMass's Foundation): the cabin's support, its mast under the main mass only. */
function wallSupport(f: MassFrame): SheetSupport {
  const s = buildingSupports(f.site.o.params)
  return fromPlan(f, supportPlan({ poly: massPoly(f.m), ...s, mastAt: f.mi === 0 ? s.mastAt : undefined, groundY: groundY(f) }))
}

/** Under a standalone deck (StandaloneDeckMesh's DeckMass): its own supports, from under its boards. */
function standaloneSupport(f: MassFrame): SheetSupport {
  return fromPlan(f, supportPlan({ poly: massPoly(f.m), ...deckSupports(f.site.o.params), top: -DECK_M, groundY: groundY(f) }))
}

/** Posts down to the ground from `top` (metres from the mass floor), building frame. */
function wingPosts(f: MassFrame, points: readonly LocalPoint[], top: number): SheetSupportPost[] {
  return standingPosts(points, top, groundY(f), SUPPORT_EMBED_M).map((p) => ({ at: toBuilding(f, p.at), topFt: rel(f, p.y1), footFt: rel(f, p.y0 + SUPPORT_EMBED_M), onGround: true }))
}

/** A deck wing (DeckMass with no supports of its own): a rim beam just inside its edge on posts down to the ground. */
function deckWingSupport(f: MassFrame): SheetSupport {
  const poly = massPoly(f.m)
  const top = -DECK_M - DECK_BEAM_M
  const rim = deckRimOutline(poly).map((p) => toBuilding(f, p))
  return {
    ...empty(f, 'deck posts'),
    section: { sizeFt: mToFt(DECK_POST_M), round: false },
    posts: wingPosts(f, deckPostPoints(poly), top),
    beams: rim.map((a, i): Seg => [a, rim[(i + 1) % rim.length]]),
    beam: { depthFt: mToFt(DECK_BEAM_M), widthFt: null },
  }
}

/**
 * A porch (PorchMass): posts up to its roof beam wherever they may stand
 * (not inside the walls, not in front of another mass's door), carried on
 * down to the ground under a porch with a floor where it is off the ground.
 */
function porchSupport(f: MassFrame, closed: readonly (readonly LocalPoint[])[], inDoorway: (p: LocalPoint) => boolean): SheetSupport {
  const m = f.m
  const points = keptPorchPosts(massPoly(m), { insideWalls: (p) => insideAny(closed, toBuilding(f, p)), inDoorway })
  const below = m.slab ? wingPosts(f, points, -DECK_M) : []
  const posts = points.map((p): SheetSupportPost => {
    const at = toBuilding(f, p)
    const down = below.find((q) => q.at[0] === at[0] && q.at[1] === at[1])
    return { at, topFt: f.levelFt + m.h, footFt: down?.footFt ?? f.levelFt, onGround: !!down }
  })
  return { ...empty(f, 'porch posts'), section: { sizeFt: mToFt(PORCH_POST_M), round: false }, posts }
}

/** What every part of a building stands on, in part order; stairs and ramps stand on their own stringers and are left out. */
export function sheetSupports(site: PartSite): SheetSupport[] {
  const closed = site.masses.filter((m) => !m.open).map(massBuildingPoly)
  const rails = site.standalone ? null : objectRailSite(site.world, site.o)
  return site.masses.flatMap((m, mi): SheetSupport[] => {
    const levelFt = site.standalone ? 0 : m.lvl
    const f: MassFrame = { site, m, mi, levelFt, floorM: site.floorM + ftToM(levelFt) }
    if (site.standalone) return [standaloneSupport(f)]
    if (m.kind === 'wall') return [wallSupport(f)]
    if (m.kind === 'deck') return [deckWingSupport(f)]
    if (m.kind === 'porch') return [porchSupport(f, closed, rails?.inDoorway(mi) ?? (() => false))]
    return []
  })
}

/** Every point the supports draw in plan (stilts splay out past the floor), for the drawing's extent. */
export const supportPoints = (supports: readonly SheetSupport[]): LocalPoint[] =>
  supports.flatMap((s) => [...s.posts.map((p) => p.at), ...s.struts.flatMap((t) => [t.a, t.b]), ...(s.mast ? [s.mast.at] : [])])
