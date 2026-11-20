import type { LocalPoint } from '../../../buildings/footprint'
import { DECK_M } from '../../../buildings/decks/wingPosts'
import { mToFt } from '../../../site/units'
import { chainSegments } from '../model/roofCreases'
import { partPoints } from '../model/parts'
import { insidePolygon } from '../svgDims'
import type { SheetBuilding, SheetOpening, SheetPart, SheetRetainingWall, SheetStair } from '../types'
import type { SectionCut } from './sectionCuts'
import { clipBeyond, clipOutsideBox, cutTriangle, depthOf, envelopeAt, farDepthAt, lineCrossings, lineIntervals, planAt, projectedEdges, silhouette, subtractIntervals, uOf, type Box, type Interval, type Tri, type UY } from './sectionGeom'
import type { PartMeshes, SectionSource } from './sectionSource'

/**
 * One section of a building as data, in (u, y) feet, y above the main
 * floor: what the cut passes through (walls with their openings, floors,
 * roofs, posts, retaining walls, the ground) drawn heavy, and what is seen
 * beyond it drawn thin, with the levels it marks.
 */

/** A wall the cut passes through, from its part's floor to its top (up the gable where one stands on it), open from sill to head where the cut passes through an opening. */
export interface CutWall {
  readonly part: string
  readonly u0: number
  readonly u1: number
  readonly y0: number
  readonly y1: number
  readonly opening: { readonly tag: string; readonly kind: SheetOpening['kind']; readonly sill: number; readonly head: number } | null
}

/** A floor (or deck) the cut passes through: its top at the part's floor, its slab below. */
export interface CutBand {
  readonly part: string
  readonly u0: number
  readonly u1: number
  readonly y0: number
  readonly y1: number
}

export interface SectionLevel {
  readonly label: string
  readonly yFt: number
}

export interface SectionView {
  readonly cut: SectionCut
  /** The building's extent along the cut (every part's outline, eave and steps), feet. */
  readonly uMin: number
  readonly uMax: number
  readonly walls: readonly CutWall[]
  readonly floors: readonly CutBand[]
  /** Each cut roof as a closed outline to fill: a slab's own section, or the surface with a roof band under it. */
  readonly roofs: readonly (readonly UY[])[]
  /** Posts, skirts, gable infill off the walls, stairs and retaining walls the cut passes through, closed outlines. */
  readonly solids: readonly (readonly UY[])[]
  /** What is seen beyond the cut, as thin polylines: roofs, openings, parts, posts, stairs; less what a cut part's far wall and floor hide. */
  readonly beyond: readonly (readonly UY[])[]
  /** Finished grade along the cut, and the survey under it. */
  readonly grade: readonly UY[]
  readonly survey: readonly UY[]
  readonly levels: readonly SectionLevel[]
  /** The cut walls' outside faces along u, low to high, for the width chain. */
  readonly faces: readonly number[]
  /** The span of everything the cut passes through (walls, floors, roofs), for the overall width; null when it passes through nothing. */
  readonly cutSpan: Interval | null
  /** Highest and lowest y drawn. */
  readonly top: number
  readonly bottom: number
}

/** Classic roofs are one surface: they get a band this deep under it on the section, feet (10 in). */
export const ROOF_FT = 10 / 12
/** The floor slab under every floor, as the scene draws a deck's, feet. */
export const FLOOR_FT = mToFt(DECK_M)
/** A skirt drawn this thick, feet (6 in). */
const SKIRT_FT = 0.5
/** The ground runs this far past the building each way, and is read this often, feet. */
export const GROUND_RUN_FT = 4
const GROUND_STEP_FT = 1
/** Chain ends within this are one point, feet; the roof beyond is read this often. */
const JOIN_FT = 1e-3
const SILHOUETTE_STEP_FT = 0.5
/** A crossing within this of a wall interval's end is that end, feet. */
const AT_END_FT = 1e-4
/** Levels closer than this are one mark, feet (1 in). */
const SAME_LEVEL_FT = 1 / 12
/** A post is cut when its centre is within half its size, and this, of the plane; a post without a size is this wide. */
const POST_FT = 0.5
export const GRADE_LABEL = 'Grade at cut'
/** A stair the cut passes through is drawn with a waist this deep under its treads, feet (9 in, nominal). */
export const WAIST_FT = 0.75
/** Something of another part is hidden by a far wall when its nearest point is no more than the wall's thickness and this in front of the wall's outside face (a porch on the far wall is, and a porch roof tucked into it), feet. */
const HIDE_FT = 0.25
/** A far wall's depth is read this often along the cut, feet. */
const HIDE_STEP_FT = 0.25
/** A stair whose run lies within this of square to the cut (|cos|) is seen or cut across its run. */
const ACROSS_RUN = 0.3

/** Something seen beyond the cut: its line on the drawing, how far back its nearest point lies (feet), and the part it belongs to (none for posts), whose own walls never hide it. */
interface Seen {
  readonly pts: readonly UY[]
  readonly depth: number
  readonly part?: string
}

/** The nearest depth of a closed outline beyond the cut (0 where it reaches the cut). */
const nearestDepth = (cut: SectionCut, outline: readonly LocalPoint[]): number => Math.max(0, Math.min(...outline.map((p) => depthOf(cut, p))))

const rect = (u0: number, u1: number, y0: number, y1: number): UY[] => [
  [u0, y0],
  [u1, y0],
  [u1, y1],
  [u0, y1],
]
const closed = (pts: readonly UY[]): UY[] => [...pts, pts[0]]

/** The opening a cut wall is open through: an opening piece on the outline edge the cut crosses, around the crossing. */
function openingAt(part: SheetPart, edge: number, t: number): CutWall['opening'] {
  const a = part.outline[edge]
  const b = part.outline[(edge + 1) % part.outline.length]
  const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2
  if (l2 < 1e-12) return null
  const along = (p: LocalPoint) => ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2
  for (const o of part.openings) {
    for (const piece of o.pieces) {
      if (piece.edge !== edge) continue
      const ta = along(piece.a)
      const tb = along(piece.b)
      if (t > Math.min(ta, tb) && t < Math.max(ta, tb)) return { tag: o.tag, kind: o.kind, sill: part.levelFt + o.sillFt, head: part.levelFt + o.headFt }
    }
  }
  return null
}

/** The plane's crossings with some triangles, as segments on the drawing. */
const cutAll = (tris: readonly Tri[], cut: SectionCut): (readonly [UY, UY])[] => tris.map((t) => cutTriangle(t, cut)).filter((s): s is readonly [UY, UY] => s !== null)

/** The gable's top over a stretch of u, or −∞ where none stands. */
function gableTop(cut: SectionCut, meshes: PartMeshes | undefined, u0: number, u1: number): number {
  const segs = cutAll(meshes?.gables ?? [], cut)
  if (!segs.length) return -Infinity
  return Math.max(...[u0, (u0 + u1) / 2, u1].map((u) => envelopeAt(segs, u)?.top ?? -Infinity))
}

function cutWalls(cut: SectionCut, part: SheetPart, meshes: PartMeshes | undefined): CutWall[] {
  if (part.kind !== 'wall' || part.inner.length < 3) return []
  const crossings = lineCrossings(part.outline, cut)
  const bands = subtractIntervals(lineIntervals(part.outline, cut), lineIntervals(part.inner, cut))
  const plate = part.levelFt + part.wallFt
  return bands.map(([u0, u1]) => {
    const outer = crossings.find((x) => Math.abs(x.u - u0) < AT_END_FT || Math.abs(x.u - u1) < AT_END_FT)
    return {
      part: part.name,
      u0,
      u1,
      y0: part.levelFt,
      y1: Math.max(plate, gableTop(cut, meshes, u0, u1)),
      opening: outer ? openingAt(part, outer.edge, outer.t) : null,
    }
  })
}

/** A gable infill this close to a cut wall is that wall's gable end, feet. */
const ON_WALL_FT = 0.05
/** A gable infill standing off the walls (a prow's, at its roof's own outline) is drawn this thick when its part has no wall to take it from, feet. */
const GABLE_FT = 0.5

/** Gable infill the cut passes through away from the cut walls (a prow roof stands its gables at its eave line): a band the wall's thickness, from its foot to the roof. */
function gableCuts(cut: SectionCut, part: SheetPart, meshes: PartMeshes | undefined, walls: readonly CutWall[]): UY[][] {
  const segs = cutAll(meshes?.gables ?? [], cut).filter(([a, b]) => !walls.some((w) => Math.min(a[0], b[0]) >= w.u0 - ON_WALL_FT && Math.max(a[0], b[0]) <= w.u1 + ON_WALL_FT))
  const byU = new Map<number, number[]>()
  for (const [a, b] of segs) {
    const u = Math.round(((a[0] + b[0]) / 2) * 100) / 100
    byU.set(u, [...(byU.get(u) ?? []), a[1], b[1]])
  }
  const t = part.edges.find((e) => e.thicknessFt > 0)?.thicknessFt ?? GABLE_FT
  return [...byU].flatMap(([u, ys]) => {
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    return y1 - y0 > SAME_LEVEL_FT ? [rect(u - t / 2, u + t / 2, y0, y1)] : []
  })
}

/** A roof's cut: each chain of the plane's crossings with its triangles, closed where it is a slab, else given a band under it. */
function cutRoof(cut: SectionCut, meshes: PartMeshes): UY[][] {
  const segs = cutAll(meshes.roof, cut)
  if (!segs.length) return []
  return chainSegments(segs, JOIN_FT).map((chain) => {
    const first = chain[0]
    const last = chain[chain.length - 1]
    if (chain.length > 3 && Math.hypot(first[0] - last[0], first[1] - last[1]) < JOIN_FT * 10) return chain
    return [...chain, ...[...chain].reverse().map(([u, y]): UY => [u, y - ROOF_FT])]
  })
}

/** A roof's outline seen beyond the cut: its triangles' far side, projected, top and bottom. */
function roofBeyond(cut: SectionCut, meshes: PartMeshes, part: string): Seen[] {
  const polys = [...meshes.roof, ...meshes.gables].map((t) => clipBeyond(t, cut)).filter((poly) => poly.length)
  if (!polys.length) return []
  const depth = Math.min(...polys.flat().map((p) => depthOf(cut, [p[0], p[2]])))
  const segs = polys.flatMap((poly) => projectedEdges(poly, cut))
  return silhouette(segs, SILHOUETTE_STEP_FT).map((run) => ({ pts: [...run.top, ...[...run.bottom].reverse(), run.top[0]], depth, part }))
}

/** Openings on the walls beyond whose inside faces look back at the viewer, sill to head. */
function openingsBeyond(cut: SectionCut, part: SheetPart): Seen[] {
  if (part.kind !== 'wall') return []
  return part.openings.flatMap((o) =>
    o.pieces.flatMap((piece) => {
      const mid: LocalPoint = [(piece.a[0] + piece.b[0]) / 2, (piece.a[1] + piece.b[1]) / 2]
      if (depthOf(cut, mid) <= 0) return []
      // the outward side of the wall points away from the viewer: its inside face is the one seen
      const dx = piece.b[0] - piece.a[0]
      const dz = piece.b[1] - piece.a[1]
      const l = Math.hypot(dx, dz) || 1
      const n: LocalPoint = [dz / l, -dx / l]
      const outward = insidePolygon(part.outline, [mid[0] + n[0] * 0.05, mid[1] + n[1] * 0.05]) ? [-n[0], -n[1]] : n
      if (outward[0] * cut.look[0] + outward[1] * cut.look[1] <= 0.05) return []
      const u0 = uOf(cut, piece.a)
      const u1 = uOf(cut, piece.b)
      if (Math.abs(u1 - u0) < 1 / 48) return []
      return [{ pts: closed(rect(Math.min(u0, u1), Math.max(u0, u1), part.levelFt + o.sillFt, part.levelFt + o.headFt)), depth: Math.min(depthOf(cut, piece.a), depthOf(cut, piece.b)), part: part.name }]
    }),
  )
}

/** The span along u of the part of an outline beyond the cut, or null when none of it is. */
function spanBeyond(cut: SectionCut, outline: readonly LocalPoint[]): Interval | null {
  const us: number[] = []
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]
    const da = depthOf(cut, a)
    const db = depthOf(cut, b)
    if (da >= 0) us.push(uOf(cut, a))
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db)
      us.push(uOf(cut, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]))
    }
  })
  return us.length >= 2 ? [Math.min(...us), Math.max(...us)] : null
}

/** How much of a stair's run lies along the cut (its cosine), with the run's ends on the drawing. */
function runOnCut(cut: SectionCut, stair: SheetStair): { readonly along: number; readonly ut: number; readonly uf: number } {
  const [top, foot] = stair.run
  const ut = uOf(cut, top)
  const uf = uOf(cut, foot)
  const runLen = Math.hypot(foot[0] - top[0], foot[1] - top[1])
  return { along: runLen > 1e-6 ? (uf - ut) / runLen : 0, ut, uf }
}

/** A stair's treads and risers (or a ramp's slope) along the cut, top first. */
function stepsAlong(cut: SectionCut, part: SheetPart, s: SheetStair): UY[] {
  const { along, ut, uf } = runOnCut(cut, s)
  const yTop = part.levelFt
  if (s.kind === 'ramp' || s.risers < 1) return [
    [ut, yTop],
    [uf, yTop - s.dropFt],
  ]
  const tread = (s.treadIn / 12) * along
  const rise = s.dropFt / s.risers
  const pts: UY[] = [[ut, yTop]]
  for (let k = 0; k < s.risers; k++) {
    const u = ut + tread * k
    pts.push([u, yTop - rise * (k + 1)])
    pts.push([k + 1 < s.risers ? u + tread : uf, yTop - rise * (k + 1)])
  }
  return pts
}

/** A stair's or ramp's profile seen beyond the cut: its treads and risers (or slope) where its run lies along the cut, else the box it fills. */
function stairProfile(cut: SectionCut, part: SheetPart): UY[] | null {
  const s = part.stair
  if (!s) return null
  if (Math.abs(runOnCut(cut, s).along) >= ACROSS_RUN) return stepsAlong(cut, part, s)
  const span = spanBeyond(cut, part.outline)
  return span ? closed(rect(span[0], span[1], part.levelFt - s.dropFt, part.levelFt)) : null
}

/** A stair or ramp the cut passes through, as solids: its steps with a waist under them where its run lies along the cut, else the tread it crosses, over each stretch it cuts. */
function stairCut(cut: SectionCut, part: SheetPart, spans: readonly Interval[]): UY[][] {
  const s = part.stair
  if (!s) return []
  const { along, ut } = runOnCut(cut, s)
  const yTop = part.levelFt
  if (Math.abs(along) >= ACROSS_RUN) {
    const steps = stepsAlong(cut, part, s)
    const [uLast, yLast] = steps[steps.length - 1]
    return [closed([...steps, [uLast, yLast - WAIST_FT], [ut, yTop - WAIST_FT]])]
  }
  const dTop = depthOf(cut, s.run[0])
  const dFoot = depthOf(cut, s.run[1])
  const t = Math.abs(dTop - dFoot) > 1e-9 ? Math.min(1, Math.max(0, dTop / (dTop - dFoot))) : 0
  const y = s.kind === 'ramp' || s.risers < 1 ? yTop - s.dropFt * t : yTop - (s.dropFt / s.risers) * (Math.min(s.risers - 1, Math.floor(t * s.risers)) + 1)
  return spans.map(([u0, u1]) => rect(u0, u1, y - WAIST_FT, y))
}

/** A part the cut misses but that lies beyond it: its floor's edge, and its walls' or posts' top, across the span it covers. */
function partBeyond(cut: SectionCut, part: SheetPart, meshes: PartMeshes | undefined): Seen[] {
  if (part.stair) return []
  const span = spanBeyond(cut, part.outline)
  if (!span) return []
  const [u0, u1] = span
  const depth = nearestDepth(cut, part.outline)
  const out: Seen[] = []
  if (meshes?.floor) out.push({ pts: closed(rect(u0, u1, part.levelFt - FLOOR_FT, part.levelFt)), depth, part: part.name })
  if (part.wallFt > 0) out.push({ pts: closed(rect(u0, u1, part.levelFt, part.levelFt + part.wallFt)), depth, part: part.name })
  return out
}

/** A porch's posts at its corners beyond the cut, floor to post top. */
function porchPosts(cut: SectionCut, part: SheetPart): Seen[] {
  if (part.kind !== 'porch' || part.wallFt <= 0) return []
  const corners = part.points.filter((p) => p.vertex !== null).map((p) => p.at)
  return corners
    .filter((p) => depthOf(cut, p) >= 0)
    .map((p): Seen => {
      const u = uOf(cut, p)
      return {
        pts: [
          [u, part.levelFt],
          [u, part.levelFt + part.wallFt],
        ],
        depth: depthOf(cut, p),
        part: part.name,
      }
    })
}

/** Posts the cut passes through (solid) and posts beyond it (thin), foot to top; skirts where the cut crosses them. */
function supportsOf(cut: SectionCut, b: SheetBuilding): { solids: UY[][]; beyond: Seen[] } {
  const solids: UY[][] = []
  const beyond: Seen[] = []
  for (const s of b.supports) {
    const w = s.section?.sizeFt ?? POST_FT
    for (const p of s.posts) {
      const d = depthOf(cut, p.at)
      const u = uOf(cut, p.at)
      const outline = rect(u - w / 2, u + w / 2, p.footFt - (p.onGround ? s.embedFt : 0), p.topFt)
      if (Math.abs(d) <= w / 2 + POST_FT / 4) solids.push(outline)
      else if (d > 0) beyond.push({ pts: closed(outline), depth: d })
    }
    const part = b.parts.find((q) => q.massIndex === s.massIndex)
    if (s.skirt && part && part.levelFt - FLOOR_FT - s.skirt.bottomFt > SAME_LEVEL_FT) {
      for (const x of lineCrossings(part.outline, cut)) solids.push(rect(x.u - SKIRT_FT / 2, x.u + SKIRT_FT / 2, s.skirt.bottomFt, part.levelFt - FLOOR_FT))
    }
  }
  return { solids, beyond }
}

/** One reading of a far wall: where along the cut (`end` is the stretch's own end at its first and last), and how far back it stands there. */
interface OccluderSample {
  readonly u: number
  readonly far: number | null
  readonly end: number
}

/** A cut part whose far wall and floor hide what lies behind them: its outline, the height they stand over, and their depth read along the cut. */
interface Occluder {
  readonly part: string
  /** How far in front of the outside face something of another part may reach and still be hidden, feet. */
  readonly reach: number
  readonly y0: number
  readonly y1: number
  readonly samples: readonly (readonly OccluderSample[])[]
}

/** A part the cut passes through as an occluder, from its floor's underside to its plate, its far side read every HIDE_STEP_FT along each stretch it cuts. */
function occluderOf(cut: SectionCut, part: SheetPart, spans: readonly Interval[]): Occluder {
  const samples = spans.map(([a, b]) => {
    const n = Math.max(1, Math.ceil((b - a) / HIDE_STEP_FT))
    return Array.from({ length: n + 1 }, (_, k) => {
      const end = k === 0 ? a : k === n ? b : a + ((b - a) * k) / n
      const u = Math.min(b - 1e-6, Math.max(a + 1e-6, end))
      return { u, far: farDepthAt(part.outline, cut, u), end }
    })
  })
  const thickest = Math.max(0, ...part.edges.map((e) => e.thicknessFt))
  return { part: part.name, reach: thickest + HIDE_FT, y0: part.levelFt - FLOOR_FT, y1: part.levelFt + part.wallFt, samples }
}

/** The boxes an occluder hides from something seen: none of its own part's, else each run of samples whose far side stands in front of it. */
function hiddenBoxes(o: Occluder, s: Seen): Box[] {
  if (s.part === o.part) return []
  return o.samples.flatMap((row) => {
    const boxes: Box[] = []
    let start: number | null = null
    row.forEach((r, k) => {
      const hides = r.far !== null && s.depth >= r.far - o.reach
      if (hides && start === null) start = r.end
      const closes = start !== null && (!hides || k === row.length - 1)
      if (closes) {
        boxes.push({ u0: start as number, u1: hides ? r.end : row[k - 1].end, y0: o.y0, y1: o.y1 })
        start = null
      }
    })
    return boxes
  })
}

/** What is seen beyond, less what the cut parts' far walls and floors hide. */
function hideBehind(seen: readonly Seen[], occluders: readonly Occluder[]): UY[][] {
  return seen.flatMap((s) => occluders.flatMap((o) => hiddenBoxes(o, s)).reduce<UY[][]>((pieces, box) => pieces.flatMap((p) => clipOutsideBox(p, box)), [[...s.pts]]))
}

/** The ground is read this far past a retaining wall's faces for the bank it holds back, feet. */
const BANK_READ_FT = 0.25

/** A retaining wall the cut passes through, from its footing to its top there: the bank behind it (the higher ground either side), within its lowest and highest top. */
function retainingCut(cut: SectionCut, src: SectionSource, w: SheetRetainingWall): UY[][] {
  const poly = [...w.face, ...[...w.back].reverse()]
  return lineIntervals(poly, cut).map(([u0, u1]) => {
    const bank = Math.max(src.grade(planAt(cut, u0 - BANK_READ_FT)), src.grade(planAt(cut, u1 + BANK_READ_FT)))
    return rect(u0, u1, w.footFt, Math.min(w.topHighFt, Math.max(w.topLowFt, bank)))
  })
}

function groundAlong(cut: SectionCut, src: SectionSource, u0: number, u1: number): { grade: UY[]; survey: UY[] } {
  const n = Math.max(1, Math.ceil((u1 - u0) / GROUND_STEP_FT))
  const us = Array.from({ length: n + 1 }, (_, k) => Math.min(u1, u0 + k * GROUND_STEP_FT))
  return { grade: us.map((u): UY => [u, src.grade(planAt(cut, u))]), survey: us.map((u): UY => [u, src.survey(planAt(cut, u))]) }
}

/** A cut roof's named height at y, or a plain description. */
function roofLevelName(part: SheetPart, y: number, fallback: string): string {
  const named = part.roof?.levels.find((l) => Math.abs(part.levelFt + part.wallFt + l.riseFt - y) < SAME_LEVEL_FT)
  return named ? `${part.name} ${named.label}` : `${part.name} ${fallback}`
}

function mergeLevels(raw: readonly SectionLevel[]): SectionLevel[] {
  return [...raw]
    .sort((a, c) => a.yFt - c.yFt)
    .reduce<SectionLevel[]>((out, l) => {
      const last = out[out.length - 1]
      if (last && l.yFt - last.yFt < SAME_LEVEL_FT) return last.label.split(' / ').includes(l.label) ? out : [...out.slice(0, -1), { ...last, label: `${last.label} / ${l.label}` }]
      return [...out, l]
    }, [])
}

/** One section of a building through the given cut. */
export function sectionView(b: SheetBuilding, src: SectionSource, cut: SectionCut): SectionView {
  const meshesOf = (p: SheetPart) => src.parts.find((m) => m.massIndex === p.massIndex)
  const us = b.parts.flatMap(partPoints).map((p) => uOf(cut, p))
  const uMin = us.length ? Math.min(...us) : 0
  const uMax = us.length ? Math.max(...us) : 0
  const walls: CutWall[] = []
  const floors: CutBand[] = []
  const roofs: UY[][] = []
  const seen: Seen[] = []
  const occluders: Occluder[] = []
  const stairs: UY[][] = []
  const gables: UY[][] = []
  const levels: SectionLevel[] = []
  for (const part of b.parts) {
    const meshes = meshesOf(part)
    const spans = lineIntervals(part.outline, cut)
    const isCut = spans.length > 0
    const partWalls = cutWalls(cut, part, meshes)
    walls.push(...partWalls)
    gables.push(...gableCuts(cut, part, meshes, partWalls))
    if (isCut && meshes?.floor) {
      floors.push(...spans.map(([u0, u1]) => ({ part: part.name, u0, u1, y0: part.levelFt - FLOOR_FT, y1: part.levelFt })))
      levels.push({ label: part.massIndex === b.parts[0]?.massIndex ? 'Floor' : `${part.name} floor`, yFt: part.levelFt })
    }
    if (partWalls.length) levels.push({ label: `${part.name} plate`, yFt: part.levelFt + part.wallFt })
    const roofCut = meshes ? cutRoof(cut, meshes) : []
    roofs.push(...roofCut)
    if (roofCut.length) {
      const ys = roofCut.flat().map((p) => p[1])
      const high = Math.max(...ys)
      levels.push({ label: roofLevelName(part, high, 'roof top at cut'), yFt: high })
    }
    if (partWalls.length) occluders.push(occluderOf(cut, part, spans))
    if (meshes) seen.push(...roofBeyond(cut, meshes, part.name))
    seen.push(...openingsBeyond(cut, part))
    if (!isCut) seen.push(...partBeyond(cut, part, meshes))
    seen.push(...porchPosts(cut, part))
    if (isCut) stairs.push(...stairCut(cut, part, spans))
    else if (spanBeyond(cut, part.outline)) {
      const stair = stairProfile(cut, part)
      if (stair) seen.push({ pts: stair, depth: nearestDepth(cut, part.outline), part: part.name })
    }
  }
  const supports = supportsOf(cut, b)
  const beyond = hideBehind([...seen, ...supports.beyond], occluders)
  const solids = [...supports.solids, ...gables, ...stairs, ...(b.earthworks?.walls ?? []).flatMap((w) => retainingCut(cut, src, w))]
  const { grade, survey } = groundAlong(cut, src, uMin - GROUND_RUN_FT, uMax + GROUND_RUN_FT)
  const faces = outerFaces(walls)
  if (faces.length) {
    for (const u of [faces[0], faces[faces.length - 1]]) levels.push({ label: GRADE_LABEL, yFt: src.grade(planAt(cut, u)) })
  } else if (grade.length) levels.push({ label: GRADE_LABEL, yFt: Math.min(...grade.map((g) => g[1])) })
  const allY = [...walls.flatMap((w) => [w.y0, w.y1]), ...floors.flatMap((f) => [f.y0, f.y1]), ...roofs.flat().map((p) => p[1]), ...beyond.flat().map((p) => p[1]), ...solids.flat().map((p) => p[1]), ...grade.map((g) => g[1]), ...survey.map((g) => g[1]), 0]
  const cutUs = [...walls.flatMap((w) => [w.u0, w.u1]), ...floors.flatMap((f) => [f.u0, f.u1]), ...roofs.flat().map((p) => p[0])]
  return {
    cutSpan: cutUs.length ? [Math.min(...cutUs), Math.max(...cutUs)] : null,
    cut,
    uMin,
    uMax,
    walls,
    floors,
    roofs,
    solids,
    beyond,
    grade,
    survey,
    levels: mergeLevels(levels),
    faces,
    top: Math.max(...allY),
    bottom: Math.min(...allY),
  }
}

/** The outside faces of the cut walls along u: each wall's end away from the part's inside, merged where two walls meet. */
function outerFaces(walls: readonly CutWall[]): number[] {
  const ends = walls.flatMap((w) => [w.u0, w.u1]).sort((a, c) => a - c)
  if (!ends.length) return []
  // a wall pair across a room: the outermost ends and, inside, the ends that face the room are inside faces; the chain measures outside to outside, so keep each wall's outer end
  const byPart = new Map<string, CutWall[]>()
  for (const w of walls) byPart.set(w.part, [...(byPart.get(w.part) ?? []), w])
  const faces = [...byPart.values()].flatMap((ws) => {
    const sorted = [...ws].sort((a, c) => a.u0 - c.u0)
    return sorted.flatMap((w, i) => (i % 2 === 0 ? [w.u0] : [w.u1]))
  })
  return [...new Set(faces.map((u) => Math.round(u * 1e4) / 1e4))].sort((a, c) => a - c)
}
